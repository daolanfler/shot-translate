# Improve low-confidence OCR correction workflow

## Goal

Use OCR confidence and editable source text to make uncertain recognition results easier to review and correct before or after translation.

## Requirements

* Surface OCR confidence in history/result state where useful.
* Mark low-confidence OCR results with a clear user-facing state.
* Make source text correction and retry translation ergonomic from the result window.
* Preserve existing failure and retry behavior for empty OCR or translation errors.

## Acceptance Criteria

* Low-confidence OCR can be distinguished from successful high-confidence OCR.
* Users can correct recognized source text and trigger translation without recapturing.
* History preserves enough metadata to understand OCR quality.
* E2E or unit coverage verifies low-confidence and correction paths.

## Out of Scope

* Adding multi-candidate OCR alternatives.
* Changing translation provider behavior.
