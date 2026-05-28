# Introduce React Router in main window

## Goal

Use this project as a controlled React Router exercise by making the main window's Settings, History, and Updates views URL-driven while preserving Electron window context routing.

## Requirements

* Add `react-router-dom`.
* Keep the existing `WindowContext` IPC flow in `App`.
* Do not route capture or result windows through React Router.
* Introduce `HashRouter` only for the main window.
* Replace `MainShell` local active-view state with routes:
  * `/settings`
  * `/history`
  * `/updates`
* Redirect `/` to `/settings`.
* Use router navigation/location to drive the Mantine navigation selected state.
* Update tests only where route behavior becomes part of user-facing expectations.

## Acceptance Criteria

* [ ] Main window renders Settings at `#/settings`.
* [ ] Main window renders History at `#/history`.
* [ ] Main window renders Updates at `#/updates`.
* [ ] Capture and result windows still render from `WindowContext`, not React Router.
* [ ] `pnpm typecheck` passes.
* [ ] `pnpm build` passes.

## Definition of Done

* React Router dependency installed.
* Main window views are route-driven.
* Project verification passes.

## Out of Scope

* Electron window creation changes.
* Routing screenshot overlay or result popup.
* Unrelated UI redesign.
