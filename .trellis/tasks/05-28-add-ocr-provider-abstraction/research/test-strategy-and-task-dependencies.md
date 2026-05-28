# Research: Test strategy and task dependencies

- Query: What tests and sequencing should support the OCR provider abstraction, especially around preprocessing and benchmark tasks?
- Scope: internal
- Date: 2026-05-28

## Findings

Current automated coverage is service-focused Vitest plus Playwright E2E. `package.json` exposes `pnpm test`, `pnpm typecheck`, and `pnpm build`; existing unit tests live beside services (`src/main/services/translator.test.ts`, `src/main/services/history.test.ts`). Service tests are lightweight and use Vitest directly (`src/main/services/translator.test.ts:1`).

Recommended tests for this task:

- Unit test provider language normalization and default fallback: empty/blank languages should resolve to `["eng"]`, duplicates should be deduped, ordering should be stable.
- Unit test facade/provider fallback: with no configured provider, `recognizeText` uses the Tesseract provider id/path.
- Unit test lifecycle: when language key changes, the old provider worker is disposed before a new worker is used; `terminateOcrWorker()` calls provider `dispose()` and is idempotent.
- Unit test recognition failure policy: a provider recognition failure disposes/reset state so the next call can construct a fresh worker.
- Unit test progress adaptation: provider structured progress becomes existing workflow-compatible messages without changing `AppEvent`.

Do not run real Tesseract in normal unit tests. Use provider injection or a mocked `createWorker` dependency. Real OCR is slower, touches language cache, and may need network/local traineddata availability. The benchmark fixture suite is the right place for real OCR quality/performance checks.

Existing E2E mocks should remain unaffected. `E2eHarness.recognizeText` returns `OcrResult` and progress via callback (`src/main/testing/e2eHarness.ts:39`), while `mockCaptureSubmit` drives `processCaptureResult` without invoking real OCR (`src/main/testing/e2eHarness.ts:89`). Provider abstraction should not force E2E to construct a provider unless the larger workflow-boundary refactor takes that on.

## Dependency / Sequencing Recommendations

This provider abstraction is a good prerequisite for:

- `.trellis/tasks/05-28-add-ocr-benchmark-fixture-suite`: benchmarks can call providers through the same interface and compare text, confidence, and elapsed time. The benchmark PRD already wants provider/preprocessing comparison and local fixture assertions.
- `.trellis/tasks/05-28-add-image-preprocessing-pipeline-for-ocr`: preprocessing should sit before `OcrProvider.recognize(input)`, producing the image data URL passed into the provider. The provider input should not own upscale/grayscale/threshold settings.
- `.trellis/tasks/05-28-productize-ocr-language-selection`: profile/migration work can later translate user settings into provider-specific language/options. This task should keep `ocrLanguages` compatible and avoid a new user-facing provider setting.
- `.trellis/tasks/05-28-refactor-main-process-workflow-boundaries`: if done first, it can give OCR workflow cleaner injection points. If this OCR abstraction is done first, keep main-index edits tiny so the later refactor can move the facade without behavior drift.

Suggested implementation order:

1. Provider abstraction and Tesseract migration.
2. Benchmark suite using provider interface.
3. Preprocessing pipeline feeding provider input.
4. Productized language profiles and future provider-specific language mapping.

## Files Found

- `src/main/services/ocr.ts`: current Tesseract worker cache, language normalization, recognition, cleanup.
- `src/main/services/settings.ts`: persisted OCR language defaults and settings update flow.
- `src/shared/types.ts`: shared `AppSettings`, `OcrResult`, workflow event, and preload API types.
- `src/main/index.ts`: capture workflow integration, progress/status handling, shutdown cleanup.
- `src/main/testing/e2eHarness.ts`: mocked OCR path for Playwright E2E.
- `src/main/services/translator.test.ts`: current service unit test style.
- `.trellis/tasks/05-28-add-image-preprocessing-pipeline-for-ocr/prd.md`: adjacent preprocessing requirements.
- `.trellis/tasks/05-28-add-ocr-benchmark-fixture-suite/prd.md`: adjacent benchmark requirements.
- `.trellis/tasks/05-28-productize-ocr-language-selection/prd.md`: future language profile requirements.
- `.trellis/tasks/05-28-refactor-main-process-workflow-boundaries/prd.md`: future main process extraction requirements.

## Related Specs

- `.trellis/spec/backend/quality.md`
- `.trellis/spec/frontend/ipc-electron.md`
- `.trellis/spec/shared/typescript.md`

## Caveats / Not Found

- No existing `ocr.test.ts` or settings service test was found.
- No fixture assets exist yet for OCR benchmarking.
- `rg` reported missing `test`/`tests` directories; test files are currently colocated and under `e2e/`.
