# Fix Concurrent Settings Persistence Writes

## Goal

Ensure concurrent settings updates cannot leave `settings.json` with an older persisted snapshot than the latest accepted settings state.

## Problem

Renderer-side request tokens prevent stale IPC responses from overwriting the UI, but they do not protect main-process persistence. `updateSettings()` currently updates `cachedSettings` and then awaits `persistSettings(cachedSettings)`. Multiple overlapping `settings:update` calls can therefore race at the disk write layer.

There is a second related risk in `writeJsonFile()`: concurrent writes in the same process use the same temp path, `${filePath}.${process.pid}.tmp`, which can cause temp-file collisions or rename failures.

## Requirements

* Serialize main-process settings updates so each patch is applied and persisted in a deterministic order.
* Keep `cachedSettings` and `settings.json` consistent after each successful update.
* Prevent concurrent atomic writes to the same JSON file from sharing one temp path.
* Preserve existing settings validation, shortcut registration behavior, safeStorage encryption, and E2E behavior.
* Add focused regression coverage for overlapping settings updates and temp file uniqueness where practical.

## Acceptance Criteria

* [x] Concurrent `updateSettings()` calls cannot persist an older snapshot after a newer update completes.
* [x] Concurrent writes do not reuse the same temp filename.
* [x] Existing settings tests continue to pass.
* [x] `pnpm typecheck` passes.
* [x] `pnpm test` passes.
* [x] `pnpm build` passes if main-process code changes require packaged-flow verification.

## Out of Scope

* Changing renderer settings UX.
* Changing preload or IPC response shapes.
* Reworking the whole JSON store abstraction beyond the concurrency fix needed here.

## Technical Notes

Likely files:

* `src/main/services/settings.ts`
* `src/main/services/store.ts`
* `src/main/services/settings.test.ts`
* Possibly `src/main/services/shortcut.ts` if shortcut registration needs queue-aware handling.

The likely implementation is a small main-process queue around settings updates plus unique temp names in `writeJsonFile()`.
