# Add image preprocessing pipeline for OCR

## Goal

Improve screenshot OCR quality by adding a configurable preprocessing stage before recognition.

## Requirements

* Add a preprocessing pipeline between screenshot crop and OCR provider input.
* Support at least upscale, grayscale, contrast adjustment, and threshold-style preprocessing options.
* Keep defaults conservative so current behavior remains predictable.
* Provide a debug-friendly way to compare original vs processed OCR inputs during development.

## Acceptance Criteria

* [x] OCR receives the processed image through a single shared preprocessing path.
* [x] The pipeline can be disabled or configured without rewriting provider code.
* [x] Small text and low-contrast fixture cases have a testable improvement path.
* [x] Existing mocked E2E flow remains unaffected.

## Out of Scope

* Replacing the OCR engine.
* Adding a full user-facing image tuning UI.
