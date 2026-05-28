# Converge UI component and icon dependencies

## Goal

Reduce overlapping renderer UI and icon dependencies while keeping the desktop app visually consistent and maintainable.

## Requirements

* [x] Audit current use of Mantine, Radix/shadcn-style components, Tailwind utilities, lucide icons, and Tabler icons.
* [x] Choose a primary component and icon strategy for main window and overlay/result windows.
* [x] Remove or isolate unused dependencies once migration is complete.
* [x] Preserve current UI behavior and E2E selectors.

## Acceptance Criteria

* [x] The renderer has a documented primary UI/component direction.
* [x] Duplicate icon/component libraries are reduced where feasible.
* [x] Main, capture, and result windows remain visually coherent.
* [x] Build and E2E tests pass after dependency cleanup.

## Out of Scope

* Full visual redesign.
* Changing core capture/OCR/translation workflows.
