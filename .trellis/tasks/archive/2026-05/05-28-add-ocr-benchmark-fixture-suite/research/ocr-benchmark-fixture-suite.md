# Research: OCR benchmark fixture suite

- Query: Research and refine the planning task for a local OCR benchmark fixture suite.
- Scope: internal
- Date: 2026-05-28

## Findings

### Files Found

- `.trellis/tasks/05-28-add-ocr-benchmark-fixture-suite/prd.md` - current task goal and acceptance criteria for local OCR benchmarks.
- `package.json` - package scripts and dependency versions; no OCR benchmark script exists yet.
- `vitest.config.ts` - Vitest runs Node tests matching `src/**/*.test.ts`.
- `playwright.config.ts` - e2e tests are isolated under `e2e`, single worker, 45s timeout.
- `e2e/fixtures.ts` - Electron e2e fixture creates `.tmp/e2e-user-data`, launches built `out/main/index.js`, and resets app state.
- `e2e/app.spec.ts` - current UI tests use mocked OCR/translation flows and Playwright polling assertions.
- `src/main/services/ocr.ts` - current OCR implementation using `tesseract.js`.
- `src/main/services/history.test.ts` - service test style with Vitest, local mocks, explicit expectations.
- `src/main/services/translator.test.ts` - table-driven Vitest assertions for deterministic logic.
- `src/main/index.ts` - workflow wrapper for OCR and capture submission.
- `src/shared/types.ts` - `OcrResult` has `text` and `confidence`; `TranslationResult` already includes `elapsedMs`.
- `src/main/testing/e2eHarness.ts` - mocked e2e OCR returns synthetic text and confidence, not real OCR.
- `src/renderer/screens/CaptureOverlay.tsx` - renderer crops screenshots to PNG data URLs before submitting OCR input.
- `.trellis/spec/backend/quality.md` - test and quality guidance, including clear failure categories.
- `.trellis/spec/shared/pnpm-electron-setup.md` - confirms pnpm/Electron setup expectations.

### Code Patterns

- `package.json:13` defines `test` as `vitest run`; `package.json:16` defines `e2e` as `playwright test`; `package.json:18` has a standalone smoke script pattern.
- `package.json:55` pins `tesseract.js` as `^6.0.1`; `package.json:72` uses `vitest` `^4.1.7`.
- `vitest.config.ts:5-8` uses the Node environment, includes only `src/**/*.test.ts`, and clears/restores mocks.
- `src/main/services/ocr.ts:14-18` creates the Tesseract cache under `app.getPath("userData")/tessdata`.
- `src/main/services/ocr.ts:20-23` normalizes languages by trimming, deduping, sorting, and falling back to `eng`.
- `src/main/services/ocr.ts:42-61` caches one Tesseract worker per sorted language key.
- `src/main/services/ocr.ts:63-88` returns trimmed OCR text and numeric confidence from `worker.recognize`.
- `src/main/services/ocr.ts:89-94` tears down the worker after recognition failures.
- `src/main/index.ts:240-246` routes OCR through `recognizeTextForWorkflow`, allowing e2e mocks to bypass real OCR.
- `src/main/index.ts:580-586` handles `capture:submit`, closes capture windows, and calls workflow processing with a PNG data URL.
- `src/shared/types.ts:90-93` defines OCR result data as text plus confidence only; elapsed time is not currently part of `OcrResult`.
- `src/shared/types.ts:95-99` shows translation metrics already include `elapsedMs`, so OCR benchmark elapsed time can stay benchmark-local before changing app-facing shared types.
- `e2e/fixtures.ts:10-25` shows temp user data can be controlled through `SHOT_TRANSLATE_USER_DATA_DIR`; reuse the same idea for benchmark cache isolation if running through Electron.
- `src/main/testing/e2eHarness.ts:39-44` mocks OCR confidence as 99/0, so e2e tests do not validate real Tesseract behavior.
- `src/renderer/screens/CaptureOverlay.tsx:112-127` crops the selected region into a PNG data URL; benchmark fixtures should mimic this final OCR input format rather than raw full-screen images.
- `src/main/services/translator.test.ts:11-23` uses table-driven expectations for deterministic cases.
- `src/main/services/history.test.ts:54-60` uses `toMatchObject` for partial object assertions, which is a useful pattern for benchmark result metadata.
- `playwright.config.ts:4-10` keeps e2e separate from unit tests; OCR benchmarks should not be folded into Playwright unless they must validate window/capture behavior.

### Related Specs

- `.trellis/spec/backend/quality.md` - relevant for test structure, failure clarity, and avoiding broad brittle assertions.
- `.trellis/spec/shared/typescript.md` - relevant for strict typing if adding benchmark data schemas or result objects.
- `.trellis/spec/shared/code-quality.md` - relevant for focused, maintainable helpers.
- `.trellis/spec/shared/pnpm-electron-setup.md` - relevant to command design and pnpm usage.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` - relevant if benchmark results later flow through shared IPC or UI.

### External References

- `tesseract.js` version from `package.json:55`: `^6.0.1`.
- `vitest` version from `package.json:72`: `^4.1.7`.
- No web lookup was needed; recommendations are based on the checked-in package versions and current source shape.

## Implementation Recommendations

### Fixture Categories

- Store benchmark assets under a first-party fixture tree, for example `fixtures/ocr/` or `src/main/services/__fixtures__/ocr/`. Prefer a repo-level `fixtures/ocr/` if future provider/preprocessing work will need non-test scripts to consume the same corpus.
- Keep fixture images synthetic or deliberately authored. Do not use private screenshots. Include small PNG crops that resemble the renderer output from `CaptureOverlay`, not full desktop screenshots.
- Start with a small corpus that maps directly to the PRD:
  - `small-ui-text`: small 10-14px English UI labels, menu text, button text.
  - `mixed-zh-en`: simplified Chinese plus English product/UI terms in the same crop.
  - `low-contrast`: foreground/background contrast near real app disabled/secondary text.
  - `desktop-app-common`: settings panels, table rows, dialog text, status labels.
  - `dense-line-wrap`: multi-line paragraph or history-like row to expose segmentation issues.
  - `punctuation-numbers`: version strings, shortcuts, URLs, model names, and decimals.
- Pair each fixture image with metadata in JSON or TS data, including `id`, `description`, `languages`, `expectedKeywords`, optional `forbiddenPatterns`, optional `minConfidence`, and optional `maxWarmElapsedMs`.
- Include at least one `eng`-only fixture and at least one `eng+chi_sim` fixture because `ocr.ts` caches workers by language key and language changes rebuild the worker.

### Assertion Style Tolerant Of OCR Variation

- Avoid exact full-text equality. Normalize text before assertions by lowercasing Latin text, applying Unicode NFKC, collapsing whitespace, normalizing common OCR punctuation variants, and stripping spaces between CJK characters only for comparison.
- Use weighted keyword assertions rather than full-string assertions:
  - Required keywords: all must appear after normalization.
  - Optional keywords: score by count or ratio.
  - Regex assertions: use for numbers, shortcuts, and model-like tokens.
  - Forbidden patterns: catch obvious garbage such as empty output, replacement-character runs, or repeated single letters.
- Make failures report fixture id, language set, raw OCR text, normalized OCR text, missing keywords, confidence, elapsed time, and image path.
- Use thresholds per fixture category. Low-contrast and tiny-text fixtures should have lower keyword-ratio or confidence thresholds than high-contrast common UI text.
- Treat confidence as diagnostic plus optional threshold, not the only pass/fail signal. Tesseract confidence can vary by language data and preprocessing.

### Runtime And Performance Metrics

- Capture both cold and warm timing if feasible:
  - Cold run includes worker creation and language data load.
  - Warm run reuses the cached worker and better represents repeated captures.
- Keep elapsed time benchmark-local at first instead of changing `OcrResult`; `TranslationResult.elapsedMs` shows elapsed metrics exist elsewhere, but OCR workflow currently exposes only text/confidence.
- Emit machine-readable JSON results to a temp or ignored output path such as `.tmp/ocr-benchmark-results.json`, with per-fixture metrics and aggregate totals.
- Measure elapsed time with `performance.now()` or `node:perf_hooks`, not `Date.now()`.
- Avoid hard failing on elapsed time in normal `pnpm test`; OCR runtime depends heavily on machine, cache state, language data, and WASM startup. Use warnings or a dedicated benchmark command for timing thresholds.
- Explicitly terminate the OCR worker after a benchmark run via `terminateOcrWorker()` to avoid hanging Node processes and cross-case state leaks.

### Command And Script Design

- Add a dedicated package script rather than overloading `pnpm test`, for example `ocr:bench` or `bench:ocr`.
- Prefer a Node/Vitest-based command over Playwright because the benchmark should exercise `src/main/services/ocr.ts` directly and run without windows or network services.
- If implemented as Vitest, keep it excluded from the default `vitest.config.ts` include pattern unless runtime is short and fixtures are stable. A dedicated config or file pattern avoids making normal unit tests slow.
- If implemented as a script, follow the existing standalone script convention from `smoke:capture` and make output concise by default with a JSON output option for provider comparisons.
- Ensure the command sets or mocks Electron `app.getPath("userData")` safely, because `ocr.ts` depends on `electron.app`. A benchmark run outside Electron may need a small adapter or test mock for `electron`.
- Do not require network access. The first run may need local Tesseract language data availability unless already cached; document any expected cache behavior.

### Unblocking Provider And Preprocessing Work

- Define a provider/preprocessor interface for benchmark execution at the boundary of `imageDataUrl -> OcrResult-like result`, even if the first implementation only wraps current Tesseract.
- Keep fixture metadata independent of Tesseract so future OCR providers can run the same corpus.
- Record per-run configuration in results: provider id, languages, preprocessing pipeline id, timestamp, Node/Electron versions if available, and fixture corpus version.
- Support baseline comparison by saving a previous JSON result and comparing keyword score, confidence, and warm elapsed time deltas per fixture.
- Make preprocessing experiments explicit variants, for example `none`, `grayscale`, `contrast`, `scale2x`, so future work can compare quality and latency tradeoffs without changing assertions.
- Use the suite to identify category-level regressions, not just aggregate pass/fail. Provider/preprocessing decisions should be able to answer "improves low contrast but hurts small UI text."

## Caveats / Not Found

- No existing first-party OCR tests were found.
- No first-party OCR image fixture convention was found.
- No existing OCR benchmark command or benchmark result format was found.
- Current e2e tests mock OCR and translation; they validate workflow/UI behavior, not actual OCR accuracy.
- `implement.jsonl` and `check.jsonl` still contain only seed `_example` entries; they have not been curated.
- `ocr.ts` imports `electron.app`, so direct Node benchmark execution needs either Electron context, a module mock, or a refactor to inject/cache the tessdata path.
- Tesseract language data availability and first-run cache population can affect local runtime; benchmark docs should distinguish initial setup cost from repeated local runs.
