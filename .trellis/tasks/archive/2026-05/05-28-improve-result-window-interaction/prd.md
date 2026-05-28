# Improve result window interaction

## Goal

Make the floating translation result window easier to inspect and reposition while keeping it inside the current display bounds.

## Requirements

* Let `ResultWindow` be resizable.
* Preserve a sensible minimum result window size.
* Let users drag the result window from its header.
* Clamp drag movement so the window cannot move beyond the current display work area.
* Delete `TODO.md` once this final TODO item is implemented.

## Acceptance Criteria

* [x] Result window no longer has fixed max width/height constraints.
* [x] Dragging the result window header moves the window.
* [x] Dragging is clamped to the current display work area.
* [x] Existing result window close/copy/retry interactions still work.
* [x] `TODO.md` is removed.
* [x] `pnpm typecheck` passes.
* [x] `pnpm build` passes.
* [x] `pnpm e2e` passes.

## Definition of Done

* Result window interaction implemented.
* TODO removed.
* Project verification passes.

## Out of Scope

* Redesigning the result window UI.
* Multi-monitor manual hardware validation beyond display work-area clamping logic.
