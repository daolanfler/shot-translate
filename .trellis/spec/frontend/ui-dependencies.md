# UI Dependency Direction

## Primary Component Strategy

Use Mantine as the primary component system for the main application window: settings, history, updates, modals, forms, alerts, badges, navigation, and scrollable management views.

Use native HTML plus Tailwind utilities for capture and result overlays. These windows are transparent or floating, have custom drag/selection behavior, and should avoid importing broad component libraries unless a specific interaction requires it.

## Icon Strategy

Use `@tabler/icons-react` for application icons. Do not introduce a second icon library for new renderer work.

## Local Primitives

Keep local `src/renderer/components/ui` primitives only when they support overlay/error UI that Mantine is not a good fit for. Do not keep generated component files as speculative inventory.

## Styling Strategy

Tailwind remains the utility layer for overlay surfaces and shared renderer tokens. Mantine props and theme values should drive main-window layout and controls. Avoid adding another styling system.

## Cleanup Rule

Before adding a UI dependency, search existing renderer usage and prefer:

1. Mantine component for main-window management UI.
2. Existing local primitive or native element for overlay/result/error UI.
3. Tabler icon for any icon need.
