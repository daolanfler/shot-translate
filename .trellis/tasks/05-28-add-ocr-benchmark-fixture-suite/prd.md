# Add OCR benchmark fixture suite

## Goal

Create a local OCR benchmark suite so OCR engine and preprocessing changes can be compared with repeatable quality and performance checks.

## Requirements

* Add fixture screenshots covering small UI text, mixed Chinese/English, low contrast, and common desktop app text.
* Define expected keyword or normalized text assertions that tolerate minor OCR variation.
* Capture confidence and elapsed time where available.
* Make the benchmark runnable from a package script or documented command.

## Acceptance Criteria

* The suite can run locally without external network services.
* Failures clearly identify which fixture and expectation regressed.
* The benchmark can compare the current OCR implementation against future provider/preprocessing changes.
* Test assets do not include private screenshots or sensitive data.

## Out of Scope

* Guaranteeing exact OCR text equality for every fixture.
* Adding cloud OCR providers.
