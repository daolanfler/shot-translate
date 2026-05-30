# Constrain Shortcut Registrar Ownership

## Goal

Make `ShortcutRegistrar` own only the capture shortcut it registers, and expose domain-level operations for replacing that shortcut without clearing unrelated global shortcuts.

## Problem

`createShortcutRegistrar()` currently exposes overlapping registration methods and relies on `globalShortcut.unregisterAll()` when registering or replacing the capture shortcut. The app only has one shortcut today, so this works by accident, but it makes the registrar responsible for every Electron global shortcut in the process.

If the app adds more global shortcuts later, updating the capture shortcut could unregister shortcuts owned by another feature. The registrar should instead remember the accelerator it owns, unregister only that accelerator, and restore the previous capture shortcut if replacement fails.

## Requirements

* Keep startup behavior available through a method that registers the capture shortcut from full settings.
* Replace low-level public registration APIs with domain-level shortcut lifecycle operations.
* Track the currently registered capture accelerator inside `ShortcutRegistrar`.
* Do not call `globalShortcut.unregisterAll()` from normal capture shortcut registration, replacement, or settings update paths.
* Unregister only the previously owned capture accelerator when replacing the shortcut.
* If a new shortcut cannot be registered, restore the previous capture shortcut and leave persisted settings unchanged.
* If the replacement shortcut matches the currently registered shortcut, avoid unnecessary unregister/register churn.
* Keep `settingsUpdateManager` responsible for settings validation and persistence decisions, not low-level shortcut unregister/register sequencing.
* Preserve existing behavior for invalid shortcuts, failed shortcut registration, successful shortcut registration, non-shortcut settings updates, and E2E mode.
* Do not refresh shortcut registration for settings patches that do not change the shortcut.
* Define the full `AppSettings` contract with a shared Zod schema and derive the TypeScript settings type from it.
* Reuse the shared settings schema for IPC settings patch validation instead of duplicating settings field definitions.
* Update tests to prove unrelated global shortcuts would not be cleared.

## Acceptance Criteria

* [x] `ShortcutRegistrar` no longer exposes `registerAccelerator`.
* [x] `ShortcutRegistrar` does not expose a normal-use API that clears all global shortcuts.
* [x] Capture shortcut registration and replacement use `globalShortcut.unregister(accelerator)` for the registrar-owned accelerator instead of `globalShortcut.unregisterAll()`.
* [x] Successful shortcut replacement unregisters the previous capture shortcut and registers the new one.
* [x] Failed shortcut replacement restores the previous capture shortcut and does not persist the failed shortcut.
* [x] Replacing with the currently registered shortcut is a no-op that does not unregister and re-register it.
* [x] Non-shortcut settings updates do not call shortcut registrar lifecycle methods.
* [x] `AppSettings` is backed by a shared Zod schema.
* [x] IPC settings patch validation reuses the shared settings schema.
* [x] `settingsUpdateManager` calls semantic shortcut lifecycle methods rather than low-level unregister/register sequencing.
* [x] Tests cover successful replacement, failed replacement with fallback restore, same-shortcut no-op behavior, and avoiding `unregisterAll()` in normal registration/replacement paths.
* [x] `pnpm typecheck` passes.
* [x] `pnpm test` passes.
* [x] `pnpm build` passes because main-process code changes.

## Out of Scope

* Changing IPC/preload/renderer settings APIs.
* Changing settings persistence serialization behavior.
* Renaming user-facing setting labels.
* Adding new global shortcuts beyond the existing capture shortcut.

## Technical Notes

Likely files:

* `src/main/services/shortcut.ts`
* `src/main/services/settingsUpdateManager.ts`
* `src/main/services/settingsUpdateManager.test.ts`
* `src/main/services/shortcut.test.ts` if useful for direct registrar tests

Implementation direction:

* Prefer a registrar state field such as `registeredShortcut: string | null`.
* Use Electron's `globalShortcut.unregister(accelerator)` to release only the owned shortcut.
* Reserve process-wide `globalShortcut.unregisterAll()` for app-level teardown only, if it is still needed outside this registrar abstraction.
