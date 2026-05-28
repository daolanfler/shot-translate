# Converge UI component and icon dependencies

## Goal

Reduce overlapping renderer UI and icon dependencies while keeping the desktop app visually consistent and maintainable.

## Requirements

* Audit current use of Mantine, Radix/shadcn-style components, Tailwind utilities, lucide icons, and Tabler icons.
* Choose a primary component and icon strategy for main window and overlay/result windows.
* Remove or isolate unused dependencies once migration is complete.
* Preserve current UI behavior and E2E selectors.

## Acceptance Criteria

* The renderer has a documented primary UI/component direction.
* Duplicate icon/component libraries are reduced where feasible.
* Main, capture, and result windows remain visually coherent.
* Build and E2E tests pass after dependency cleanup.

## Out of Scope

* Full visual redesign.
* Changing core capture/OCR/translation workflows.
