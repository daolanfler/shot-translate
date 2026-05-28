# Research: OCR provider interface shape

- Query: What provider boundary should replace the direct Tesseract.js OCR service without changing current capture behavior?
- Scope: mixed
- Date: 2026-05-28

## Findings

The current public OCR surface is narrow: `recognizeText(imageDataUrl, languages, onStatus?)` returns shared `OcrResult` with `text` and `confidence`, while `terminateOcrWorker()` handles shutdown cleanup (`src/main/services/ocr.ts:63`, `src/main/services/ocr.ts:97`, `src/shared/types.ts:90`). Keep this compatibility surface for existing call sites, but introduce an internal provider contract under the main process, not preload or renderer.

Recommended provider types:

```ts
export type OcrProviderId = "tesseract";

export type OcrProgressEvent = {
  providerId: OcrProviderId;
  stage: "loading" | "recognizing";
  message: string;
  progress?: number;
};

export type OcrRecognizeInput = {
  imageDataUrl: string;
  languages: string[];
};

export interface OcrProvider {
  readonly id: OcrProviderId;
  recognize(input: OcrRecognizeInput, onProgress?: (event: OcrProgressEvent) => void): Promise<OcrResult>;
  dispose(): Promise<void>;
}
```

Keep `OcrProviderId` local to main until a real user-facing selector exists. Adding `ocrProvider` to `AppSettings` now would create migration and UI surface beyond this PRD; current settings only persist `ocrLanguages` for OCR (`src/shared/types.ts:41`, `src/shared/types.ts:49`, `src/main/services/settings.ts:8`). If a default selector is desired for future-proofing, use an internal `getOcrProvider(settings)` that always resolves `"tesseract"` for now.

Expose structured provider progress internally, but keep the workflow bridge converting it to status strings. The renderer only consumes `workflow-status` payload `busy/message` (`src/shared/types.ts:149`, `src/renderer/screens/MainShell.tsx:167`), so this task should not widen IPC.

The provider input should remain image-data-url based for this task because capture currently submits `CaptureSubmitPayload.imageDataUrl` (`src/shared/types.ts:138`) and the Tesseract API accepts generic image-like inputs (`node_modules/tesseract.js/src/index.d.ts:26`). Leave room for preprocessing by naming the field generically as the image that OCR receives, but do not add preprocessing options here.

## Code Patterns

- Main process imports shared types via relative paths; preserve this style for provider files (`.trellis/spec/backend/quality.md:19`).
- Exported functions should have explicit return types (`.trellis/spec/shared/typescript.md:7`).
- Use an interface for `OcrProvider` because future providers are expected to implement the same shape (`.trellis/spec/shared/typescript.md:40`).
- Keep privileged/native OCR work in main. Renderer should continue using typed preload APIs only (`.trellis/spec/frontend/ipc-electron.md:22`, `.trellis/spec/frontend/ipc-electron.md:134`).

## External References

- Installed Tesseract.js is `^6.0.1` (`package.json`).
- `createWorker(langs, oem, options)` supports multiple languages and `cachePath`; it also exposes a `logger` callback for progress (`node_modules/tesseract.js/docs/api.md:32`, `node_modules/tesseract.js/docs/api.md:42`, `node_modules/tesseract.js/docs/api.md:52`).
- `worker.recognize` returns an object with `jobId` and `data`; empty pages are valid outputs, not exceptions (`node_modules/tesseract.js/docs/api.md:89`, `node_modules/tesseract.js/docs/api.md:92`).

## Related Specs

- `.trellis/spec/backend/index.md`
- `.trellis/spec/backend/quality.md`
- `.trellis/spec/frontend/ipc-electron.md`
- `.trellis/spec/shared/typescript.md`

## Caveats / Not Found

- No existing OCR provider selection setting or UI exists.
- No OCR-specific unit test currently exists.
- No runtime validation schema exists for `AppSettings`; shared types are TypeScript interfaces only.
