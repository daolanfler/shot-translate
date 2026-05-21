import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createWorker } from "tesseract.js";
import type { OcrResult } from "../../shared/types";

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

const FALLBACK_LANGUAGES = ["eng"];

let workerPromise: Promise<TesseractWorker> | null = null;
let workerKey: string | null = null;

function getTessdataCachePath() {
  const cachePath = path.join(app.getPath("userData"), "tessdata");
  fs.mkdirSync(cachePath, { recursive: true });
  return cachePath;
}

function normaliseLanguages(languages: string[]): string[] {
  const trimmed = languages.map((lang) => lang.trim()).filter(Boolean);
  return trimmed.length > 0 ? Array.from(new Set(trimmed)).sort() : FALLBACK_LANGUAGES;
}

async function disposeWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  workerKey = null;

  if (!pending) {
    return;
  }

  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Worker init never succeeded or already torn down — nothing to do.
  }
}

async function getWorker(languages: string[]): Promise<TesseractWorker> {
  const requestedKey = languages.join("+");

  if (workerPromise && workerKey === requestedKey) {
    return workerPromise;
  }

  // Language set changed since last call — tear the old worker down before
  // spinning up the new one so we don't leak the previous WASM instance.
  if (workerPromise) {
    await disposeWorker();
  }

  workerKey = requestedKey;
  workerPromise = createWorker(languages, 1, {
    cachePath: getTessdataCachePath()
  });

  return workerPromise;
}

export async function recognizeText(
  imageDataUrl: string,
  languages: string[],
  onStatus?: (message: string) => void
): Promise<OcrResult> {
  const langs = normaliseLanguages(languages);
  let worker: TesseractWorker;

  try {
    onStatus?.("Loading OCR language data");
    worker = await getWorker(langs);
  } catch (error) {
    // Worker init failed — reset so the next call retries cleanly instead of
    // re-throwing the cached rejection forever.
    workerPromise = null;
    workerKey = null;
    throw error;
  }

  try {
    onStatus?.("Recognizing text");
    const result = await worker.recognize(imageDataUrl);
    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence
    };
  } catch (error) {
    // Recognition failure may leave the worker in a bad state. Tear it down so
    // the next recognize() spins up a fresh worker.
    await disposeWorker();
    throw error;
  }
}

export async function terminateOcrWorker(): Promise<void> {
  await disposeWorker();
}
