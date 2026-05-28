# Move screenshot crop flow into main process

## Goal

Keep screenshot image ownership and crop processing in the Electron main process so renderer windows only submit selection metadata.

## Requirements

* Change capture submission so renderer sends `displayId` and selection coordinates instead of cropped image data.
* Preserve the current user-facing capture flow and result anchoring behavior.
* Keep full-display capture data out of renderer-owned state where practical.
* Ensure multi-display and DPI scaling calculations remain covered by tests.

## Acceptance Criteria

* Main process performs the final crop used for OCR.
* Renderer capture overlay no longer needs to encode cropped PNG data for submission.
* Existing mocked E2E flow continues to work.
* Tests cover coordinate conversion and crop bounds.

## Out of Scope

* Replacing the OCR engine.
* Redesigning the capture overlay UI.
