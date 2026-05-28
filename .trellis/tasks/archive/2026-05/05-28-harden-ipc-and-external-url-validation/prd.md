# Harden IPC and external URL validation

## Goal

Improve Electron security and robustness by validating critical IPC payloads at runtime and restricting external URL opening.

## Requirements

* [x] Add runtime validation for settings updates, capture submit payloads, history retry inputs, result window movement, and update source changes.
* [x] Return clear user-safe errors for invalid payloads without crashing the app.
* [x] Restrict external URL opening to safe protocols such as `https:` and `mailto:`.
* [x] Keep the preload API narrow and avoid exposing privileged primitives.

## Acceptance Criteria

* [x] Invalid IPC payloads are rejected in main process before reaching service logic.
* [x] Valid existing renderer flows continue to work.
* [x] Unsafe external URLs are denied instead of passed to the OS.
* [x] Tests cover representative valid and invalid payloads.

## Out of Scope

* Redesigning the preload API surface.
* Adding a permissions system.
