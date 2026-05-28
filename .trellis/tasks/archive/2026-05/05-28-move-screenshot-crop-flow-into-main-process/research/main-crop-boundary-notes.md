# Research: main crop boundary notes

- Query: Research/check sidecar for remaining Trellis tasks `05-28-move-screenshot-crop-flow-into-main-process` and `05-28-refactor-main-process-workflow-boundaries`.
- Scope: mixed
- Date: 2026-05-28

## Findings

The current capture pipeline already has main-process ownership for display enumeration, `desktopCapturer`, capture-source caching, workflow state, history creation, OCR, translation, and result-window placement. The renderer still owns the final crop: `CaptureOverlay` loads a display screenshot through `getCaptureSource`, lets the user drag in CSS pixels, decodes the source image, scales DOM coordinates to bitmap coordinates, draws the crop to a canvas, and sends the cropped PNG data URL plus `selectionRect` back through `submitCapture` (`src/renderer/screens/CaptureOverlay.tsx:34`, `src/renderer/screens/CaptureOverlay.tsx:80`, `src/renderer/screens/CaptureOverlay.tsx:113`, `src/renderer/screens/CaptureOverlay.tsx:126`). Moving crop into main should preserve the renderer as a selection UI only.

Files found:

- `src/main/index.ts` - central app lifecycle, workflow state, capture source generation, capture IPC handlers, OCR/translation workflow.
- `src/main/windows/captureWindow.ts` - creates one transparent capture overlay per display using `display.workArea`.
- `src/main/windows/resultWindow.ts` - positions the result popup from a screen-coordinate `ScreenRect`.
- `src/preload/index.ts` - exposes `getCaptureSource`, `submitCapture`, and `cancelCapture` over the narrow bridge.
- `src/shared/types.ts` - defines `CaptureSourcePayload`, `ScreenRect`, `CaptureSubmitPayload`, and `ShotTranslateApi`.
- `src/renderer/screens/CaptureOverlay.tsx` - current drag selection UI and renderer-side canvas crop.
- `src/shared/geometry.ts` - small DOM/main-safe helper currently shared by renderer and result-window placement.
- `src/main/testing/e2eHarness.ts` - test hook depends on `processCaptureResult(imageDataUrl, selectionRect?)`.
- `package.json` - verification commands include `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm e2e`, and `pnpm smoke:capture`.

Code patterns:

- Main capture source generation uses `desktopCapturer.getSources({ types: ["screen"], thumbnailSize })`, matches by `display_id`, computes actual thumbnail scale from `source.thumbnail.getSize()`, then crops the full display thumbnail to `display.workArea` (`src/main/index.ts:214`, `src/main/index.ts:229`, `src/main/index.ts:236`, `src/main/index.ts:247`).
- Capture windows are sized to `display.workArea`, not full display bounds (`src/main/windows/captureWindow.ts:17`). This matters because renderer selection coordinates are currently window-relative/work-area-relative, while desktopCapturer thumbnails start from display bounds before main crops them to work area.
- `getCaptureSource` caches `CaptureSourcePayload` by display id during `startCaptureFlow`, then the renderer asks for the same payload (`src/main/index.ts:260`, `src/main/index.ts:379`, `src/preload/index.ts:47`).
- `capture:submit` currently trusts a renderer-supplied cropped `imageDataUrl`; it transitions to `processing`, closes all capture windows, then calls `processCaptureResult(payload.imageDataUrl, payload.selectionRect)` (`src/main/index.ts:496`).
- Result placement only needs the screen-coordinate `selectionRect`; it does not need the cropped bitmap dimensions (`src/main/windows/resultWindow.ts:24`, `src/main/windows/resultWindow.ts:73`).
- E2E bypasses real capture and feeds a generated data URL directly into `processCaptureResult`; this should remain available or be adapted behind a lower-level workflow entrypoint (`src/main/testing/e2eHarness.ts:20`, `src/main/testing/e2eHarness.ts:86`).

Recommended task ordering:

1. Do `05-28-move-screenshot-crop-flow-into-main-process` first, but keep it small: add a main-side crop helper/service and change `CaptureSubmitPayload` to carry display id plus selection geometry, not a renderer-created crop image. Keep `processCaptureResult(imageDataUrl, selectionRect?)` intact as the stable OCR/translation boundary during this task.
2. Then do `05-28-refactor-main-process-workflow-boundaries`: extract workflow/capture orchestration out of `src/main/index.ts` after the IPC contract is settled. Refactoring first would move unstable renderer-crop assumptions into new abstractions and likely require churn.
3. If splitting even further, extract pure geometry conversion first: work-area-relative CSS rect -> captured bitmap rect. That gives a unit-testable seam before changing IPC.

Concrete implementation risks to preserve:

- Coordinate spaces: renderer drag rect is CSS pixels relative to a work-area-sized transparent window; source thumbnail pixels are bitmap pixels after main has already cropped display bounds to work area. Do not double-apply `display.workArea.x/y` offsets.
- DPI/scaling: current renderer crop uses `image.width / container.clientWidth` and `image.height / container.clientHeight`; main must use the cached source payload/native image actual size rather than assuming `thumbnailSize === requested size`.
- Multi-display: cache keys must stay display-id based, and submit should verify the sender context is a capture window for that display before accepting the selection.
- Workflow state: `capture:submit` must transition to `processing` before closing capture windows so the `closed` listener does not reset to idle mid-submit (`src/main/index.ts:496`).
- Security/boundary: moving crop into main reduces renderer privilege, but the preload bridge should stay narrow. Avoid exposing raw `ipcRenderer` or generalized file/native APIs.
- Memory/history: never persist raw screenshots or cropped images in history. Keep image data transient and pass only OCR/translation/status/error into history.
- Error behavior: preserve current silent cancel path when capture source is unavailable and current "No text was detected" result flow.

Tests/checks to preserve or add:

- Run `pnpm typecheck` and `pnpm build` because the change crosses shared types, preload, main IPC, and renderer call sites.
- Add unit coverage for crop geometry conversion: normal drag, reverse drag already normalized by renderer, tiny rect cancellation, non-1 scale factor, non-origin work area, and clamping at image edges.
- Add or update E2E/smoke coverage so capture submit no longer requires renderer-generated `imageDataUrl` but still creates a history item and anchors the result window from `selectionRect`.
- Keep a test path for `processCaptureResult` with a mocked image data URL because OCR/translation workflow tests should not depend on desktop capture.
- Manually verify on Windows with at least one scaled display; multi-monitor plus mixed DPI remains a known risk from project instructions.

External references:

- Electron `desktopCapturer.getSources` returns screen/window sources and accepts `thumbnailSize`, but official docs note screen capture/platform differences and the returned thumbnail size must be treated as data-dependent, not assumed from request size: https://www.electronjs.org/docs/latest/api/desktop-capturer
- Electron `DesktopCapturerSource.thumbnail` docs explicitly warn there is no guarantee the thumbnail size equals the requested `thumbnailSize`: https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source
- Electron `contextBridge` docs recommend exposing a narrow API instead of sending full `ipcRenderer`; this aligns with keeping `window.shotTranslate` constrained during the IPC shape change: https://www.electronjs.org/docs/latest/api/context-bridge

Related specs:

- `AGENTS.md` - process-boundary constraints, command expectations, no raw screenshot history, userData-only Tesseract cache, multi-display/DPI caveat.
- `.trellis/workflow.md` - research artifacts must be persisted under the task `research/` directory; implementation/check context should include this file for downstream agents.

## Caveats / Not Found

- Direct local shell execution failed before command startup in this session, so I could not run `task.py current --source`, list local task metadata, inspect dirty state, or verify uncommitted local edits. Code observations above are from the repository connector snapshot plus the user-provided `AGENTS.md`; implementation agents should re-check local files before editing.
- `.trellis/spec/index.md` was not found through the repository connector. If local `.trellis/spec/` files exist, implementation/check agents should load the relevant package/layer specs before coding.
- No dedicated capture/crop unit test file was found through available search. Treat crop geometry tests as new coverage unless local uncommitted files already added them.
