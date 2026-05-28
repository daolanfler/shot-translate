# Research: UI dependency convergence

- Query: Audit renderer component/icon dependencies and recommend a practical convergence plan.
- Scope: internal
- Date: 2026-05-28

## Findings

### Files Found

- `package.json` - Declares overlapping UI/icon dependencies: Mantine, Tabler icons, Radix/shadcn utilities, lucide, Tailwind helpers.
- `pnpm-lock.yaml` - Confirms the `radix-ui` meta package pulls a broad Radix surface, not only primitives currently used.
- `components.json` - shadcn-style config points to `src/renderer/globals.css`, `@/components/ui`, and lucide icons.
- `electron.vite.config.ts` - Renderer uses the `@` alias and Tailwind v4 Vite plugin.
- `tsconfig.web.json` - TypeScript mirrors the `@/* -> src/renderer/*` alias.
- `src/renderer/App.tsx` - Wraps all window contexts in `MantineProvider`.
- `src/renderer/main.tsx` - Imports Mantine CSS before local `globals.css`.
- `src/renderer/globals.css` - Defines Tailwind v4 tokens, compact typography, and shadcn-style color/radius variables.
- `src/renderer/screens/MainShell.tsx` - Main window is Mantine-first with Tabler icons.
- `src/renderer/screens/CaptureOverlay.tsx` - Overlay is hand-built Tailwind, no component library imports.
- `src/renderer/screens/ResultOverlay.tsx` - Result popup is Tailwind + shadcn `Button` + lucide.
- `src/renderer/ErrorBoundary.tsx` - Uses shadcn `Alert`/`Button` + lucide.
- `src/renderer/components/ui/*` - shadcn-style local primitives; only `alert.tsx` and `button.tsx` are imported by app code.
- `e2e/app.spec.ts` - Uses test IDs, accessible labels/roles/text, and a raw `header` locator.

### Dependency Audit

- `@mantine/core` is active and central to the main window. `MainShell.tsx` imports many Mantine primitives at `src/renderer/screens/MainShell.tsx:23` and uses `Modal`, `AppShell`, `NavLink`, `Paper`, `ScrollArea`, form controls, badges, alerts, progress, and buttons throughout `src/renderer/screens/MainShell.tsx:222-693`.
- `@mantine/hooks` is declared in `package.json:43` but no direct app import was found. Keep only if required by `@mantine/core` peer/runtime expectations; otherwise it is a cleanup candidate after install/build verification.
- `@tabler/icons-react` is active only in `MainShell.tsx`, imported at `src/renderer/screens/MainShell.tsx:37` and used as Mantine `leftSection`/`ThemeIcon` icons.
- `lucide-react` is active in `ResultOverlay.tsx:2`, `ErrorBoundary.tsx:2`, and also inside unused local primitives `checkbox.tsx` and `select.tsx`. If unused primitives are removed, lucide remains needed for result/error UI unless those views migrate to Tabler.
- `radix-ui` is declared at `package.json:50`, but active app imports are only shadcn `Button` and `Alert` wrappers: `src/renderer/screens/ResultOverlay.tsx:4`, `src/renderer/ErrorBoundary.tsx:3`, and `src/renderer/ErrorBoundary.tsx:4`. The broader local primitives (`badge`, `card`, `checkbox`, `input`, `label`, `scroll-area`, `select`, `separator`, `tabs`) have no app imports.
- `class-variance-authority`, `clsx`, and `tailwind-merge` support the shadcn primitives and `cn()` utility (`src/renderer/lib/utils.ts:1-5`). If only two local primitives remain, these are optional convenience dependencies rather than a strong architectural need.
- `tw-animate-css` is imported globally in `src/renderer/globals.css:2`; no specific animation class usage was found in the inspected renderer files.
- Tailwind is not redundant. It drives capture/result/error surfaces and app-level tokens (`src/renderer/globals.css:1`, `src/renderer/globals.css:64-117`) and is used heavily by capture/result overlays.

### Code Patterns

- Main window pattern: Mantine components + Mantine props + Tabler icons. Examples: app shell at `src/renderer/screens/MainShell.tsx:246`, nav test IDs at `src/renderer/screens/MainShell.tsx:267-286`, settings forms at `src/renderer/screens/MainShell.tsx:405-490`, history cards/actions at `src/renderer/screens/MainShell.tsx:533-581`, updates controls at `src/renderer/screens/MainShell.tsx:607-693`.
- Overlay pattern: direct Tailwind classes, no library components. Capture uses a full-window div and selection/chip classes at `src/renderer/screens/CaptureOverlay.tsx:155`, `src/renderer/screens/CaptureOverlay.tsx:197`, and `src/renderer/screens/CaptureOverlay.tsx:207`.
- Result popup pattern: direct Tailwind layout with local shadcn `Button`. It relies on a semantic `header` for dragging at `src/renderer/screens/ResultOverlay.tsx:125`, close button accessibility at `src/renderer/screens/ResultOverlay.tsx:149-155`, and footer action buttons at `src/renderer/screens/ResultOverlay.tsx:212-278`.
- Provider pattern: `MantineProvider` wraps capture, result, and main contexts in `src/renderer/App.tsx:31-55`, even though capture/result do not use Mantine components.
- Styling convention conflict: `App.tsx` defines Mantine theme font/radius at `src/renderer/App.tsx:8-13`, while `globals.css` defines a separate compact Tailwind token system at `src/renderer/globals.css:12-117`. The current UI is workable, but future changes should avoid adding a third style system.

### E2E Selector Risks

- Preserve `data-testid` attributes on the main nav: `nav-settings`, `nav-history`, `nav-updates` are asserted/clicked in `e2e/app.spec.ts:20-24`, `e2e/app.spec.ts:105`, and `e2e/app.spec.ts:148`.
- Preserve accessible labels for settings inputs: `Global shortcut`, `API base URL`, `Model`, and `API key` are used in `e2e/app.spec.ts:30-39`.
- Preserve button accessible names: `Test connection`, `Retry`, and `Delete` are used in `e2e/app.spec.ts:41`, `e2e/app.spec.ts:110`, and `e2e/app.spec.ts:116`.
- Preserve visible text relied on by tests: `Shot Translate`, `Development mode`, `Settings saved.`, API success text, `Hello world`, `你好，世界`, and `Mock translation failed` are used in `e2e/app.spec.ts:18-26`, `e2e/app.spec.ts:32-42`, `e2e/app.spec.ts:65`, `e2e/app.spec.ts:107-108`, and `e2e/app.spec.ts:150`.
- Preserve a drag target selector for the result window. The test currently uses `resultPage.locator("header")` at `e2e/app.spec.ts:78`; replacing the header element or moving drag handling off it will break the test unless the test is deliberately migrated to a stable test ID.

### Recommended Direction

- Preferred component direction: keep Mantine as the primary component library for the main/settings/history/updates window. Rebuilding that surface with shadcn/Radix would be broad, high-risk, and mostly aesthetic because Mantine is already the dominant implementation.
- Preferred overlay direction: keep capture/result overlays mostly Tailwind/native. These windows are small, custom, transparent/floating, and sensitive to window chrome/drag behavior. Avoid importing Mantine into capture/result unless a real interaction need appears.
- Preferred icon direction: converge on one icon library per app, with Tabler as the lower-risk target if Mantine remains primary. MainShell already uses Tabler; migrate result/error lucide icons to Tabler only after visual parity is checked. If the team prefers shadcn/lucide long term, that implies a larger main-window migration and should not be bundled with cleanup.
- Preferred local primitive direction: either keep only `button.tsx` and `alert.tsx` as isolated overlay/error primitives, or migrate those two call sites to native/Tailwind or Mantine and delete the entire unused `components/ui` set. Do not keep unused shadcn primitives as speculative inventory.

### Migration Order

1. Document the decision in task planning: Mantine + Tabler for main window, Tailwind/native for overlays, no broad redesign.
2. Remove unused local UI primitives first: `badge`, `card`, `checkbox`, `input`, `label`, `scroll-area`, `select`, `separator`, and `tabs`, because no app imports were found.
3. Decide the two active shadcn primitives:
   - Low-risk cleanup path: keep `button.tsx`, `alert.tsx`, `cn`, `clsx`, `tailwind-merge`, and `class-variance-authority`; remove unused Radix-heavy primitives only.
   - More complete cleanup path: replace `ResultOverlay`/`ErrorBoundary` `Button` and `Alert` usage with direct Tailwind/native markup or Mantine equivalents, then remove `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `components.json`, and `src/renderer/lib/utils.ts` if no references remain.
4. Migrate lucide icons in `ResultOverlay.tsx` and `ErrorBoundary.tsx` to Tabler icons. Run a quick visual check because Tabler and lucide differ in stroke and glyph proportions.
5. Remove `lucide-react` only after local unused primitives and active result/error imports no longer reference it.
6. Reassess `@mantine/hooks` and `tw-animate-css` with a final `rg` pass. Remove only if no direct import/class usage remains and `pnpm build`, `pnpm typecheck`, and E2E still pass.
7. Keep Tailwind, Mantine core, Tabler icons, React Router, and the Tailwind Vite plugin.

### Realistic Cleanup Scope

- Small cleanup: delete unused local UI primitive files and keep the active Button/Alert island. This reduces maintenance clutter but not many package dependencies.
- Medium cleanup: migrate result/error icons to Tabler and delete `lucide-react`; delete unused UI primitives. This gives a clear single-icon-library result with modest code churn.
- Larger cleanup: remove the shadcn/Radix/CVA stack entirely by replacing active Button/Alert usage. This is feasible because only `ResultOverlay` and `ErrorBoundary` use it, but it changes overlay/error markup and should be paired with E2E/visual verification.
- Avoid full main-window migration. `MainShell.tsx` has extensive Mantine usage and E2E coverage over labels/roles/text, so replacing Mantine would be larger than the stated dependency cleanup goal.

## External References

- Installed/declarative versions from `package.json`: `@mantine/core` `^9.2.1`, `@mantine/hooks` `^9.2.1`, `@tabler/icons-react` `^3.44.0`, `lucide-react` `^1.14.0`, `radix-ui` `^1.4.3`, `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, `tailwind-merge` `^3.6.0`, `tailwindcss` `^4.3.0`, `@tailwindcss/vite` `^4.3.0`, `tw-animate-css` `^1.4.0` (`package.json:42-69`).
- shadcn config: `components.json` sets `iconLibrary` to `lucide` and aliases `ui` to `@/components/ui`.
- Electron/pnpm packaging constraint: `.npmrc` uses `node-linker=hoisted`; dependency cleanup should use pnpm and preserve the hoisted install behavior.

## Related Specs

- `.trellis/spec/frontend/index.md` - Frontend spec entrypoint and required quality references.
- `.trellis/spec/frontend/components.md` - Semantic HTML, focus, loading, and scrollbar guidance.
- `.trellis/spec/frontend/css-design.md` - CSS token and Tailwind/BEM guidance; relevant to avoiding another styling system.
- `.trellis/spec/frontend/directory-structure.md` - Renderer component/style organization expectations.
- `.trellis/spec/frontend/quality.md` - Type safety, unused imports, and verification expectations.
- `.trellis/spec/shared/pnpm-electron-setup.md` - pnpm/Electron install and packaging constraints.

## Caveats / Not Found

- No code was changed and no task lifecycle command was run.
- No direct `@mantine/hooks` usage was found, but Mantine core may still expect it as a package-level dependency; verify with install/build before removing.
- No app imports were found for most local `components/ui/*` primitives, but deleting files should still be paired with `pnpm typecheck` because path aliases make imports easy to miss if generated later.
- The dependency scan was static. Bundle-size impact was not measured.
- E2E selectors are mostly accessible-role/text based; visual-only refactors can still break tests if labels, button names, the semantic `header`, or nav test IDs change.
