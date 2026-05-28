# Refactor main process workflow boundaries

## Goal

Split the oversized Electron main process entrypoint into focused modules while preserving existing app behavior.

## Requirements

* [x] Extract capture workflow orchestration from `src/main/index.ts`.
* [x] Extract IPC handler registration into a focused module.
* [x] Extract capture source construction and display/DPI crop logic into a dedicated service.
* [x] Extract shortcut registration/update behavior into a dedicated service.
* [x] Preserve current E2E harness behavior and test hooks.

## Acceptance Criteria

* [x] User-facing capture, translation, history, settings, shortcut, update, and result-window behavior remains unchanged.
* [x] `src/main/index.ts` becomes primarily app lifecycle/bootstrap wiring.
* [x] Existing unit and E2E tests pass after the refactor.
* [x] New module boundaries are small enough to test independently.

## Out of Scope

* Reworking renderer UI.
* Changing OCR or translation provider behavior.
