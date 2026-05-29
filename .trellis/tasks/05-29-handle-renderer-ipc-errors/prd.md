# Handle Renderer IPC Invocation Errors

## Goal

Make renderer-side IPC invocation failures recoverable at the relevant call sites, especially validation errors thrown by main-process IPC handlers after the Zod IPC validation migration. The renderer should not rely on the global `unhandledrejection` logger as the normal handling path for user-triggered actions.

## What I Already Know

* Main-process validation currently throws `Error` from `parseWithSchema` when IPC arguments fail schema validation.
* Electron propagates thrown `ipcMain.handle` errors to `ipcRenderer.invoke` as rejected promises.
* `src/renderer/main.tsx` has a global `unhandledrejection` listener that reports errors, but this is only a logging fallback.
* `CaptureOverlay` catches `getCaptureSource()` failures, but `submitCapture()` is not locally caught.
* `MainShell` has several async IPC calls without local catch handling, including settings save, history operations, update source changes, capture start, retry, and clipboard writes.
* `testApiConnection()` uses `try/finally` for loading state but does not catch and convert rejected invocations into visible feedback.
* `ResultOverlay` has several retry/copy/history calls without local catch handling.

## Assumptions

* Main-process IPC handlers should continue to throw validation errors instead of converting every IPC response into a generic result envelope.
* Preload API signatures should stay stable unless a specific call already has a result-envelope contract.
* User-facing actions should show concise feedback or restore local UI state when an invocation fails.
* Low-risk fire-and-forget calls may log locally or ignore safely only when there is no meaningful UI recovery.

## Requirements

* Add local error handling around user-triggered renderer IPC calls where rejection changes flow or user feedback.
* Cover renderer IPC failures broadly, not just errors introduced by Zod validation.
* Prioritize all `window.shotTranslate` promise-returning calls triggered by user interaction, including capture, settings, history, update, retry, and clipboard actions.
* Preserve the global `unhandledrejection` reporter as a last-resort logging path, not as the primary recovery mechanism.
* Avoid a broad preload/API wrapper that changes all API return types.
* Keep error messages concise and appropriate to the UI location.
* Avoid `alert`, `confirm`, and other blocking browser dialogs.

## Acceptance Criteria

* [x] Invalid or rejected `submitCapture()` does not leave the capture overlay in an unmanaged state.
* [x] Settings save failures restore or preserve a consistent settings UI and show a visible notice.
* [x] API connection test failures stop the loading indicator and show a visible failure message.
* [x] Result overlay retry/copy failures are caught and surfaced through the existing message area.
* [x] Main shell history/update/copy actions catch rejected IPC calls and do not rely on unhandled promise rejection.
* [x] User-triggered capture start and update actions catch rejected IPC calls where possible.
* [x] TypeScript typecheck passes.
* [x] Build passes for renderer/main/preload changes.

## Definition of Done

* Tests added or updated where practical for error-message helpers or changed behavior.
* `pnpm typecheck` passes.
* `pnpm build` passes.
* No unrelated refactors or API-wide return shape changes.

## Out of Scope

* Replacing all preload API return types with `{ ok, data, error }` envelopes.
* Changing main-process IPC validation behavior.
* Reworking global error boundary or app-wide notification architecture beyond what is needed for this task.

## Technical Notes

* Likely impacted files:
  * `src/renderer/screens/CaptureOverlay.tsx`
  * `src/renderer/screens/MainShell.tsx`
  * `src/renderer/screens/ResultOverlay.tsx`
  * Optional shared renderer helper for formatting unknown errors.
* Relevant specs:
  * `.trellis/spec/frontend/ipc-electron.md`
  * `.trellis/spec/frontend/react-pitfalls.md`
  * `.trellis/spec/frontend/components.md`
  * `.trellis/spec/shared/code-quality.md`
  * `.trellis/spec/shared/typescript.md`
