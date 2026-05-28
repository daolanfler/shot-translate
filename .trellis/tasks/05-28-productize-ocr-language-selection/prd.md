# Productize OCR language selection

## Goal

Turn OCR language selection into practical profiles that balance recognition quality and performance for screenshot translation.

## Requirements

* Review current OCR language settings and default language set.
* Introduce user-understandable OCR language profiles or presets.
* Avoid slow broad-language OCR by default.
* Preserve manual override for users who need specific Tesseract language packs.

## Acceptance Criteria

* Defaults are optimized for the app's expected Chinese/English screenshot translation use case.
* Settings UI communicates the performance/quality tradeoff clearly.
* Existing settings migrate safely to the new profile model or remain compatible.
* Tests cover settings persistence and provider language input.

## Out of Scope

* Auto-detecting OCR language from image content.
* Adding new OCR engines.
