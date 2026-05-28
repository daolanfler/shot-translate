const fs = require("node:fs/promises");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { app, BrowserWindow } = require("electron");
const { createWorker } = require("tesseract.js");

const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "fixtures", "ocr");
const defaultOutputPath = path.join(repoRoot, ".tmp", "ocr-benchmark", "results.json");
const generatedFixtureDir = path.join(repoRoot, ".tmp", "ocr-benchmark", "generated-fixtures");
const tessdataCachePath = path.join(repoRoot, ".tmp", "ocr-benchmark", "tessdata");

function parseArgs(argv) {
  const options = {
    outputPath: defaultOutputPath,
    keepGenerated: false,
    runOcr: false,
    cachePath: tessdataCachePath
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }

    if (arg === "--output") {
      const outputPath = argv[index + 1];
      if (!outputPath) {
        throw new Error("--output requires a path.");
      }
      options.outputPath = path.resolve(outputPath);
      index += 1;
      continue;
    }

    if (arg === "--keep-generated") {
      options.keepGenerated = true;
      continue;
    }

    if (arg === "--run-ocr") {
      options.runOcr = true;
      continue;
    }

    if (arg === "--cache-path") {
      const cachePath = argv[index + 1];
      if (!cachePath) {
        throw new Error("--cache-path requires a path.");
      }
      options.cachePath = path.resolve(cachePath);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizeText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForKeyword(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function evaluateFixture(fixture, rawText) {
  const normalizedText = normalizeText(rawText);
  const compactText = normalizeForKeyword(rawText);
  const requiredKeywords = fixture.requiredKeywords ?? [];
  const optionalKeywords = fixture.optionalKeywords ?? [];
  const requiredPatterns = fixture.requiredPatterns ?? [];
  const missingKeywords = requiredKeywords.filter((keyword) => !compactText.includes(normalizeForKeyword(keyword)));
  const missingPatterns = requiredPatterns.filter((pattern) => !new RegExp(pattern, "i").test(normalizedText));
  const matchedOptionalKeywords = optionalKeywords.filter((keyword) => compactText.includes(normalizeForKeyword(keyword)));
  const requiredKeywordScore =
    requiredKeywords.length === 0 ? 1 : (requiredKeywords.length - missingKeywords.length) / requiredKeywords.length;
  const minKeywordRatio = fixture.minKeywordRatio ?? 1;

  return {
    normalizedText,
    requiredKeywordScore,
    matchedOptionalKeywords,
    missingKeywords,
    missingPatterns,
    passed: requiredKeywordScore >= minKeywordRatio && missingPatterns.length === 0
  };
}

async function readManifest() {
  const manifestPath = path.join(fixtureRoot, "manifest.json");
  const rawManifest = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(rawManifest);

  if (!Array.isArray(manifest)) {
    throw new Error("OCR benchmark manifest must be an array.");
  }

  return manifest;
}

async function rasterizeFixture(fixture) {
  const svgPath = path.join(fixtureRoot, fixture.file);
  const svg = await fs.readFile(svgPath, "utf-8");
  const width = Number(svg.match(/\bwidth="(\d+)"/)?.[1] ?? 800);
  const height = Number(svg.match(/\bheight="(\d+)"/)?.[1] ?? 400);
  const html = `<!doctype html><html><body style="margin:0;background:white">${svg}</body></html>`;
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true
    }
  });

  try {
    const painted = new Promise((resolve) => {
      window.webContents.once("paint", () => resolve());
      setTimeout(resolve, 500);
    });
    await window.loadURL(dataUrl);
    await painted;
    const image = await window.webContents.capturePage();
    if (image.isEmpty()) {
      throw new Error(`Fixture rendered empty image: ${fixture.id}`);
    }

    await fs.mkdir(generatedFixtureDir, { recursive: true });
    const pngPath = path.join(generatedFixtureDir, `${fixture.id}.png`);
    await fs.writeFile(pngPath, image.toPNG());
    return pngPath;
  } finally {
    window.destroy();
  }
}

async function getWorker(workerCache, languages) {
  const key = [...languages].sort().join("+");
  const cached = workerCache.get(key);
  if (cached) {
    return cached;
  }

  const worker = await createWorker([...languages].sort(), 1, {
    cachePath: workerCache.cachePath
  });
  workerCache.set(key, worker);
  return worker;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertLocalLanguageData(manifest, cachePath) {
  const languages = new Set(manifest.flatMap((fixture) => fixture.languages));
  const missing = [];

  for (const language of languages) {
    const candidates = [
      path.join(cachePath, `${language}.traineddata`),
      path.join(cachePath, `${language}.traineddata.gz`)
    ];
    const hasLocalData = await Promise.all(candidates.map(pathExists));
    if (!hasLocalData.some(Boolean)) {
      missing.push(language);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing local Tesseract language data in ${cachePath}: ${missing.join(", ")}`,
        "The default benchmark validates fixture/assertion shape without OCR.",
        "To run real OCR offline, place traineddata files in the cache path or pass --cache-path."
      ].join("\n")
    );
  }
}

async function runBenchmark(options) {
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.mkdir(options.cachePath, { recursive: true });

  const manifest = await readManifest();
  if (options.runOcr) {
    await assertLocalLanguageData(manifest, options.cachePath);
  }

  const workerCache = new Map();
  workerCache.cachePath = options.cachePath;
  const startedAt = performance.now();
  const results = [];

  try {
    for (const fixture of manifest) {
      const imagePath = await rasterizeFixture(fixture);
      const fixtureStartedAt = performance.now();
      const result = options.runOcr
        ? await (await getWorker(workerCache, fixture.languages)).recognize(imagePath)
        : {
            data: {
              text: fixture.expectedText,
              confidence: 100
            }
          };
      const elapsedMs = Math.round(performance.now() - fixtureStartedAt);
      const text = result.data.text.trim();
      const evaluation = evaluateFixture(fixture, text);

      results.push({
        id: fixture.id,
        description: fixture.description,
        imagePath: path.relative(repoRoot, imagePath),
        languages: fixture.languages,
        text,
        confidence: result.data.confidence,
        elapsedMs,
        ...evaluation
      });
    }
  } finally {
    await Promise.all([...workerCache.values()].map((worker) => worker.terminate()));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    provider: options.runOcr ? "tesseract.js" : "fixture-baseline",
    mode: options.runOcr ? "ocr" : "fixture-validation",
    totalElapsedMs: Math.round(performance.now() - startedAt),
    fixtureCount: results.length,
    passed: results.every((result) => result.passed),
    results
  };

  await fs.writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  if (!options.keepGenerated) {
    await fs.rm(generatedFixtureDir, { recursive: true, force: true });
  }

  return report;
}

function printReport(report, outputPath) {
  for (const result of report.results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(
      `${status} ${result.id} (${result.elapsedMs}ms, confidence ${Math.round(result.confidence)})`
    );

    if (!result.passed) {
      console.log(`  missing keywords: ${result.missingKeywords.join(", ") || "none"}`);
      console.log(`  missing patterns: ${result.missingPatterns.join(", ") || "none"}`);
      console.log(`  text: ${result.text}`);
    }
  }

  console.log(`\nOCR benchmark ${report.passed ? "passed" : "failed"}: ${report.fixtureCount} fixtures`);
  console.log(`Mode: ${report.mode}`);
  console.log(`Report: ${path.relative(repoRoot, outputPath)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBenchmark(options);
  printReport(report, options.outputPath);
  app.exit(report.passed ? 0 : 1);
}

app.on("window-all-closed", () => {});

app.whenReady().then(() => {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
});
