# Fix capture submit crop failure recovery

## Goal

Prevent capture mode from getting stuck when main-process crop creation fails after the renderer submits a selection.

## Requirements

* Close capture windows and reset workflow state if `cropCaptureSelection` throws during `capture:submit`.
* Preserve the successful capture path and existing crop/OCR behavior.
* Keep the preload API unchanged.
* Add focused coverage for the failure path.

## Acceptance Criteria

* [x] A crop failure during submit does not leave workflow state in `capturing`.
* [x] Capture windows are closed on crop failure.
* [x] Existing E2E capture flows continue to pass.

## Out of Scope

* Changing crop coordinate math.
* Redesigning capture UI.
