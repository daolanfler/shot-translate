# Improve low-confidence OCR correction workflow

## Goal

Use OCR confidence and editable source text to make uncertain recognition results easier to review and correct before or after translation.

## Requirements

* [x] Surface OCR confidence in history/result state where useful.
* [x] Mark low-confidence OCR results with a clear user-facing state.
* [x] Make source text correction and retry translation ergonomic from the result window.
* [x] Preserve existing failure and retry behavior for empty OCR or translation errors.

## Acceptance Criteria

* [x] Low-confidence OCR can be distinguished from successful high-confidence OCR.
* [x] Users can correct recognized source text and trigger translation without recapturing.
* [x] History preserves enough metadata to understand OCR quality.
* [x] E2E or unit coverage verifies low-confidence and correction paths.

## Out of Scope

* Adding multi-candidate OCR alternatives.
* Changing translation provider behavior.
