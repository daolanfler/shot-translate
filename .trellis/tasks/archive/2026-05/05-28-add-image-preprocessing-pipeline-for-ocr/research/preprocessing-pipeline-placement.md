# Research: OCR image preprocessing pipeline placement

- Query: Where should OCR image preprocessing live, what should v1 include, and how should it relate to crop, OCR provider, debug, performance, and benchmark work?
- Scope: internal
- Date: 2026-05-28

## Findings

### Files Found

- `src/renderer/screens/CaptureOverlay.tsx` - current renderer-side selection crop: decodes the display image, draws the selected region into a browser canvas, and submits a PNG data URL.
- `src/main/index.ts` - capture source construction, capture IPC handlers, workflow orchestration, and the current OCR call site.
- `src/main/services/ocr.ts` - Tesseract.js worker lifecycle and recognition entry point.
- `src/shared/types.ts` - app settings and capture IPC payload types shared across renderer/preload/main.
- `src/preload/index.ts` - narrow `window.shotTranslate` IPC bridge.
- `src/main/testing/e2eHarness.ts` - mocked OCR/translation path used by Playwright E2E.
- `e2e/app.spec.ts` - current E2E coverage for mocked capture, OCR failure, translation failure, result window, and history.
- `vitest.config.ts` - unit tests include `src/**/*.test.ts` only.
- `package.json` - current dependencies include Electron, React, Tesseract.js, Vitest, and Playwright; no native image-processing library is present.
- `.trellis/tasks/05-28-move-screenshot-crop-flow-into-main-process/prd.md` - related task wants renderer to submit selection metadata and main to perform final crop.
- `.trellis/tasks/05-28-add-ocr-provider-abstraction/prd.md` - related task wants a pluggable OCR provider interface.
- `.trellis/tasks/05-28-add-ocr-benchmark-fixture-suite/prd.md` - related task wants repeatable quality and latency comparisons for provider/preprocessing changes.

### Current Flow and Boundary

- Main already owns full-display capture source creation via `desktopCapturer.getSources`, work-area cropping, and display/DPI scale calculations in `src/main/index.ts:267`.
- Renderer still performs the final user-selection crop: it decodes `source.dataUrl`, maps selection CSS pixels to image pixels, draws into a canvas, and submits `canvas.toDataURL("image/png")` in `src/renderer/screens/CaptureOverlay.tsx:95` and `src/renderer/screens/CaptureOverlay.tsx:124`.
- The preload boundary exposes `submitCapture(payload: CaptureSubmitPayload)` as a typed IPC call in `src/preload/index.ts:45`.
- The shared capture payload currently requires `imageDataUrl` plus `selectionRect` in `src/shared/types.ts:138`.
- Main passes the submitted data URL directly into OCR through `processCaptureResult -> recognizeTextForWorkflow -> recognizeText` in `src/main/index.ts:363`, `src/main/index.ts:375`, and `src/main/index.ts:240`.
- The OCR service currently accepts a data URL string and calls `worker.recognize(imageDataUrl)` directly in `src/main/services/ocr.ts:63` and `src/main/services/ocr.ts:84`.

### Recommendation: Where Preprocessing Should Live

- Put the shared preprocessing pipeline in the main process, close to the OCR input boundary, not in React UI components. The strongest v1 insertion point is before `recognizeTextForWorkflow(...)` calls `recognizeText(...)`, so every non-mocked OCR request goes through one path.
- Prefer a dedicated main service such as `src/main/services/imagePreprocessing.ts` with a pure function-style API that takes an image data URL or buffer plus options and returns a processed image data URL or buffer plus metadata. This keeps renderer, preload, and OCR provider code small.
- Do not bake preprocessing into `src/main/services/ocr.ts` unless the provider abstraction task has already introduced an OCR input object. OCR providers should receive an already-prepared image; provider code should not own image tuning policy.
- Coordinate with the crop-refactor task: if crop moves to main first, preprocessing should run after main crop and before OCR. If preprocessing lands first, keep the service in main but call it on the renderer-submitted cropped `imageDataUrl`; later the crop-refactor can feed the main-produced crop into the same service.
- Keep renderer/preload API changes minimal for v1. Settings can carry preprocessing configuration through existing `settings:update` if stored in `AppSettings`; debug-only comparison should avoid widening the renderer API unless there is a clear UI requirement.

### Minimum V1 Operations

- Default behavior should be conservative and disable destructive operations by default, preserving current OCR behavior unless explicitly enabled.
- Recommended v1 option model:
  - `enabled: boolean`
  - `upscale: 1 | 2 | 3` or a bounded number with default `1`
  - `grayscale: boolean`
  - `contrast: number` with a small bounded range and default `0`
  - `threshold: { enabled: boolean; value?: number }` or `threshold: "off" | "auto" | number`
- Pipeline order for v1: decode input -> optional upscale -> optional grayscale -> optional contrast -> optional threshold -> encode PNG. Upscale before threshold preserves glyph shape better for small text.
- Avoid a broad user-facing tuning UI in this task. If settings are persisted, expose only a small developer-safe preset or hidden/manual config, because the PRD explicitly excludes a full tuning UI.
- Validate any settings patch at runtime before using it. The relevant spec says external data should be validated and typed through shared schemas/patterns; see `.trellis/spec/shared/typescript.md` and `.trellis/spec/frontend/ipc-electron.md`.

### Debug Comparison Hooks

- Add a development-only comparison hook in main that can capture both original and processed OCR inputs for local inspection without storing screenshots in normal history.
- Do not write debug images into history; the project constraint says history must not store raw screenshots.
- Practical v1 debug modes:
  - Log preprocessing metadata: original size, processed size, operations, elapsed milliseconds.
  - Optional environment-gated file dump under `app.getPath("userData")`, for example `ocr-debug/last-original.png` and `ocr-debug/last-processed.png`.
  - Optional benchmark-only function/API returning both original and processed image buffers for test code, not renderer UI.
- Keep debug hooks off by default and guarded by env/settings so packaged normal usage does not persist screenshots unexpectedly.

### Performance Risks

- Data URLs are memory-heavy. The current path already creates at least one full cropped PNG data URL in renderer; adding another processed data URL can double transient memory for large selections.
- Main-process synchronous CPU image processing can block Electron app responsiveness. If the chosen implementation is CPU-heavy, keep v1 operations bounded by max pixel count and measure elapsed time.
- Avoid adding a native dependency casually. `package.json` has no image library today, and native modules can affect Electron packaging. If a library is needed, prefer a pure JS/browser-compatible pipeline first or explicitly evaluate packaging impact.
- Upscale and threshold can hurt OCR on anti-aliased UI text if applied too aggressively. Defaults should leave threshold off and upscale modest.
- Multi-display and DPI risk remains concentrated in crop math. Preprocessing should not reinterpret screen coordinates; it should only transform the already-cropped bitmap.

### Tests and Coverage

- Existing E2E is mocked: `e2e/app.spec.ts:50` calls `window.shotTranslate.e2e!.mockCaptureSubmit(...)`, and the harness bypasses real Tesseract recognition in `src/main/testing/e2eHarness.ts:39`. Acceptance criteria says this mocked flow should remain unaffected.
- Current unit tests are only `src/**/*.test.ts` per `vitest.config.ts`; there is no existing OCR preprocessing test.
- Recommended v1 tests:
  - Unit test option normalization/defaults and disabled pipeline returning equivalent output metadata.
  - Unit test deterministic tiny fixture transforms where pixel expectations are simple enough to avoid brittle screenshots.
  - Integration-style test that `processCaptureResult` or the OCR input adapter calls preprocessing before OCR, using a mocked recognizer/provider.
  - Defer quality improvement assertions to the benchmark fixture task, where OCR text/confidence/latency comparisons belong.

### Relation to OCR Provider and Benchmark Tasks

- Provider abstraction should define the provider input after preprocessing, not make each provider decide how to preprocess. This keeps future RapidOCR/PaddleOCR/Windows OCR providers comparable.
- Benchmark fixture suite is the right place to compare original vs processed OCR quality and elapsed time across small text, mixed Chinese/English, low contrast, and desktop UI text.
- If task order is flexible, best sequencing is:
  1. Move crop flow into main, so image ownership and final crop happen in one privileged process.
  2. Add OCR provider abstraction, so the OCR input contract is explicit.
  3. Add preprocessing service at the provider input boundary.
  4. Add/extend benchmark fixtures to compare preprocessing presets.
- If preprocessing must land before those tasks, design it as a main-process service with a narrow adapter so later crop/provider tasks can reuse it without rewriting policy.

### Related Specs

- `.trellis/workflow.md` - research artifacts must be persisted under task `research/`.
- `.trellis/spec/frontend/ipc-electron.md` - renderer must use preload IPC and not access native APIs directly.
- `.trellis/spec/backend/index.md` - main process service code should follow project service/module conventions.
- `.trellis/spec/shared/typescript.md` - exported functions should have explicit return types; runtime input validation is expected for external data.
- `.trellis/spec/shared/code-quality.md` - keep changes focused and reusable; avoid broad rewrites.

## Caveats / Not Found

- `task.py current --source` reported no active task; this research used the task directory explicitly provided by the user.
- No external web documentation was consulted because this research focused on current repository architecture and planning alignment.
- No implementation code was changed.
- The exact image-processing implementation choice remains open. The repo has no current image library dependency, so implementation should evaluate pure JS/canvas feasibility versus Electron-packaging costs before adding native packages.
