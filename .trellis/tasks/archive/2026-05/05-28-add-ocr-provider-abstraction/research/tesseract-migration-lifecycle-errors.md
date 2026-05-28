# Research: Tesseract migration, lifecycle, progress, and errors

- Query: How should the current Tesseract.js implementation move behind the provider boundary while preserving lifecycle and error behavior?
- Scope: mixed
- Date: 2026-05-28

## Findings

The migration should be mostly mechanical: move the current worker cache, language normalization, tessdata cache path, and recognition logic into a `TesseractOcrProvider`, then keep `src/main/services/ocr.ts` as the facade used by the capture workflow. This avoids touching the oversized `src/main/index.ts` more than necessary and preserves the current call from `recognizeTextForWorkflow` (`src/main/index.ts:240`, `src/main/index.ts:245`).

Preserve language normalization exactly. Current behavior trims, removes blanks, deduplicates, sorts, and falls back to `["eng"]` when empty (`src/main/services/ocr.ts:9`, `src/main/services/ocr.ts:20`). Worker cache identity depends on the normalized sorted list (`src/main/services/ocr.ts:42`), and settings default to `["eng", "chi_sim"]` (`src/main/services/settings.ts:12`).

Preserve tessdata location under Electron `userData`; the current service creates `{userData}/tessdata` and passes it to Tesseract `cachePath` (`src/main/services/ocr.ts:14`, `src/main/services/ocr.ts:56`). This matches the project constraint not to write language data into the repository and aligns with Tesseract's cache support (`node_modules/tesseract.js/docs/api.md:42`).

Lifecycle should remain provider-owned and idempotent. The current service terminates the old worker when language set changes, swallows initialization/termination cleanup failures, and clears cached promises before terminating (`src/main/services/ocr.ts:25`, `src/main/services/ocr.ts:49`). The app shutdown path depends on `terminateOcrWorker()` returning a promise in `before-quit` (`src/main/index.ts:647`, `src/main/index.ts:656`).

Error handling should keep the current policy:

- Initialization failure clears cached worker state so the next attempt retries (`src/main/services/ocr.ts:71`).
- Recognition failure disposes the worker before rethrowing (`src/main/services/ocr.ts:89`).
- Empty OCR text remains a normal result mapped to `ocr_failed`, not an exception (`src/main/index.ts:379`).
- Unexpected OCR/provider errors bubble to the workflow catch and become the user-facing `errorMessage` via `toUserMessage(error)` (`src/main/index.ts:408`, `src/main/index.ts:412`).

Progress should become richer internally but stay compatible externally. The current workflow sends `"Loading OCR language data"`, `"Recognizing text"`, and provider/E2E messages as plain strings (`src/main/services/ocr.ts:72`, `src/main/services/ocr.ts:83`, `src/main/testing/e2eHarness.ts:39`). Tesseract.js has a `logger` option with `{ status, progress, jobId, workerId }` (`node_modules/tesseract.js/src/index.d.ts:45`, `node_modules/tesseract.js/src/index.d.ts:53`), so the provider can attach a logger while still emitting the existing high-level messages. Do not expose raw Tesseract statuses directly to the renderer without normalization.

## Implementation Recommendations

- Add `src/main/services/ocr/types.ts` or similar only if the service is converted to a directory; otherwise keep a small local type module beside `ocr.ts`.
- Rename the current `recognizeText` facade only if all call sites are updated in one pass; otherwise leave it in place and delegate to a default provider.
- Use dependency injection inside the facade for tests, e.g. `setOcrProviderForTests(provider)` plus `resetOcrProviderForTests()`, or export a pure provider factory. Avoid adding test-only branches to production workflow code.
- Add `OcrProviderId = "tesseract"` locally now; defer `"rapidocr" | "paddleocr" | "windows"` until those providers are real.
- Keep progress callback optional and do not require providers to emit percentage progress; future native or subprocess providers may only have stage messages.

## External References

- Tesseract recommends reusing workers across recognition jobs and warns against arbitrary parallel worker creation because each worker has high memory cost (`node_modules/tesseract.js/docs/performance.md:8`, `node_modules/tesseract.js/docs/performance.md:11`).
- `worker.terminate()` is the cleanup primitive (`node_modules/tesseract.js/docs/api.md:196`).
- Tesseract notes that image upscaling can improve recognition (`node_modules/tesseract.js/docs/api.md:76`), which should be handled by the separate preprocessing task, not embedded into this provider migration.

## Related Specs

- `.trellis/spec/backend/index.md`
- `.trellis/spec/backend/quality.md`
- `.trellis/spec/backend/error-handling.md`
- `.trellis/spec/shared/typescript.md`

## Caveats / Not Found

- No current typed OCR error class exists. Introducing one is optional; preserving current thrown-error behavior is lower risk.
- No concurrency guard exists beyond the app-level `workflowState !== "idle"` check (`src/main/index.ts:424`). Provider code should not assume parallel recognition is supported.
- Tesseract.js logger support is available in the installed package, but the current code does not use it.
