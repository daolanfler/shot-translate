# Clarify Settings Update Manager Naming

## Goal

Fix misleading main-process naming around settings updates so generic settings persistence/update behavior is not presented as a shortcut-manager responsibility.

## Problem

The IPC dependency is named `updateSettingsSafely`, but the implementation currently lives under `createShortcutManager()` / `shortcutManager`. That made sense when shortcut registration was the main special case, but the function now validates and persists broad settings patches. The naming makes future work harder to reason about, especially as settings persistence gets its own concurrency fix.

## Requirements

* Rename or restructure the main-process settings update coordinator so generic settings updates are not owned by something named only for shortcuts.
* Preserve the existing shortcut validation/registration behavior for shortcut changes.
* Preserve the current IPC contract and renderer API shape.
* Keep changes focused on naming/responsibility clarity, not the persistence-concurrency fix.
* Update tests and imports to match the new names.

## Acceptance Criteria

* [x] Main-process code no longer wires generic settings updates through a misleading `shortcutManager` name.
* [x] Shortcut-specific logic remains clear and isolated.
* [x] Existing IPC/settings/shortcut tests pass.
* [x] `pnpm typecheck` passes.
* [x] `pnpm test` passes.

## Out of Scope

* Serializing concurrent settings persistence writes. That is tracked separately in `05-29-fix-concurrent-settings-persistence-writes`.
* Changing settings IPC channel names or preload/renderer API names.
* Redesigning settings UI.

## Technical Notes

Likely files:

* `src/main/services/shortcut.ts`
* `src/main/index.ts`
* `src/main/ipcHandlers.ts` only if dependency names should be clarified
* `src/main/ipcHandlers.test.ts`
* `src/main/services/shortcut.test.ts`

Possible direction: introduce a settings update manager/coordinator that delegates shortcut-specific work to the shortcut registration code, or rename the existing factory/variable to describe its broader responsibility.
