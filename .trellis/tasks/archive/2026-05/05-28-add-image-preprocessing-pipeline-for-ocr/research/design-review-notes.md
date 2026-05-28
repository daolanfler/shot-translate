# Research: OCR preprocessing design review notes

- Query: Review in-flight preprocessing design for provider input boundary, default behavior, Electron/nativeImage feasibility, debug outputs, benchmark integration, and test risks.
- Scope: internal
- Date: 2026-05-28

## Findings

### Files Found

- `src/main/services/imagePreprocessing.ts` - new preprocessing service using Electron `nativeImage` for decode, resize, bitmap pixel transforms, optional debug image dumps.
- `src/main/services/ocr.ts` - OCR facade now calls preprocessing before delegating to the selected OCR provider.
- `src/main/services/ocrProvider.ts` - provider abstraction accepts already-prepared `imageDataUrl` plus languages.
- `src/main/index.ts` - capture workflow still calls `recognizeText(...)` through `recognizeTextForWorkflow(...)` without passing preprocessing settings.
- `src/main/services/settings.ts` and `src/shared/types.ts` - app settings currently do not include preprocessing options.
- `scripts/ocr-benchmark.cjs` - benchmark renders fixtures and sends image paths directly to Tesseract; it does not yet exercise preprocessing.
- `src/main/services/imagePreprocessing.test.ts` - unit tests cover option normalization and enabled/disabled metadata with mocked `nativeImage`.
- `src/main/services/ocrProvider.test.ts` - OCR facade/provider tests rely on disabled preprocessing returning the original data URL.
- `.trellis/tasks/05-28-add-image-preprocessing-pipeline-for-ocr/research/preprocessing-pipeline-placement.md` - prior placement research and recommendations.

### Blocking Concerns

- Configurability is incomplete if the current shape remains: `recognizeTextForWorkflow(...)` calls `recognizeText(imageDataUrl, settings.ocrLanguages, ...)` without passing any preprocessing options from settings or another configured source (`src/main/index.ts:240`, `src/main/index.ts:245`, `src/main/index.ts:375`). The PRD requires the pipeline be disabled or configured without rewriting provider code; a service-level optional parameter is not enough unless main has a real configuration source.
- Default behavior should preserve current OCR behavior as closely as possible. `preprocessImageForOcr(...)` currently constructs a `nativeImage` before checking `enabled` and returning the original input (`src/main/services/imagePreprocessing.ts:163`, `src/main/services/imagePreprocessing.ts:164`, `src/main/services/imagePreprocessing.ts:167`). For disabled defaults, a stricter compatibility path would return the original data URL without decoding, avoiding new empty-image behavior, decode failures, or extra latency before Tesseract sees the same input it sees today.
- Benchmark integration is not connected. `scripts/ocr-benchmark.cjs` sends generated image paths directly to `worker.recognize(imagePath)` and records a single result per fixture. That means preprocessing quality/latency effects are invisible to the benchmark unless the script gains preset options and records baseline vs processed cases.

### Non-Blocking Suggestions

- The provider input boundary is mostly right if interpreted as "prepare input before `OcrProvider.recognize(...)`": `ocr.ts` preprocesses before passing `imageDataUrl` into the provider (`src/main/services/ocr.ts:31`, `src/main/services/ocr.ts:33`). To keep provider policy clean, avoid moving operation choices into `TesseractOcrProvider`; main/settings should decide options and the provider should receive a prepared image.
- If preserving a provider-agnostic boundary is important for later providers, consider putting the option selection in `processCaptureResult(...)` and passing normalized options into the OCR facade, rather than letting each provider or OCR implementation infer policy.
- `nativeImage` is feasible for a v1 Electron-only pipeline: it already exists in main and supports `createFromDataURL`, `resize`, `toBitmap`, `createFromBitmap`, and PNG/data URL export. Keep the implementation bounded and measured because all pixel processing currently runs in the main process and can double memory for large selections (`src/main/services/imagePreprocessing.ts:180`, `src/main/services/imagePreprocessing.ts:189`, `src/main/services/imagePreprocessing.ts:191`).
- Debug image dumps are correctly under `app.getPath("userData")`, not history (`src/main/services/imagePreprocessing.ts:151`). Keep them environment/development gated; do not expose `debugDump` as an ordinary persisted user setting unless the UI makes the screenshot persistence explicit.
- Debug output currently writes only `last-original.png` and `last-processed.png` (`src/main/services/imagePreprocessing.ts:154`, `src/main/services/imagePreprocessing.ts:155`). Adding a small metadata log or sidecar with operations, sizes, and elapsed time would make comparisons easier without adding UI.
- Tests should assert at least one deterministic pixel transform, not only metadata and output routing. The current preprocessing tests mock `nativeImage` but do not inspect the bitmap passed to `createFromBitmap`, so channel order, contrast math, threshold behavior, and alpha preservation could regress silently.
- Add a workflow-level test or mock assertion that enabled settings actually alter the image passed to the OCR provider, while disabled settings preserve the original input. This catches the most important boundary requirement.

### Related Specs

- `.trellis/workflow.md` - research artifacts for task work should be persisted under task `research/`.
- `.trellis/spec/frontend/ipc-electron.md` - keep renderer/preload API narrow and route privileged/native work through main.
- `.trellis/spec/shared/typescript.md` - exported functions should have explicit return types and external/configured data should be validated.
- `.trellis/spec/shared/code-quality.md` - keep changes focused and avoid broad rewrites.

## Caveats / Not Found

- No code was modified outside this research note.
- No OCR implementation files were edited.
- No tests or benchmarks were run; this is a design review of the current in-flight code shape.
- The main agent may still be changing files while this review is written, so line numbers reflect the inspected state at review time.
