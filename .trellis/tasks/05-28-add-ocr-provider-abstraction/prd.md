# Add OCR provider abstraction

## Goal

Introduce a pluggable OCR provider boundary so the app can keep Tesseract.js as the default fallback while adding higher-quality OCR engines later.

## Requirements

* Define a provider interface for OCR recognition inputs, results, progress, and lifecycle cleanup.
* Move the current Tesseract.js implementation behind the provider interface without changing user-facing behavior.
* Keep language selection and tessdata caching behavior compatible with current settings.
* Leave room for future RapidOCR/PaddleOCR/Windows OCR providers without committing to one in this task.

## Acceptance Criteria

* Current capture-to-translation flow still works with the Tesseract provider.
* Provider selection has a clear default and does not require user configuration for the existing path.
* OCR worker cleanup remains available on app shutdown.
* Unit or integration coverage verifies the provider boundary and fallback behavior.

## Out of Scope

* Implementing RapidOCR, PaddleOCR, or Windows OCR.
* Changing OCR UI settings beyond what is needed for the abstraction.
