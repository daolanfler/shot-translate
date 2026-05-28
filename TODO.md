# TODO

## Learn React Router In The Electron Renderer

Goal: use this project as a small, controlled exercise for learning React Router in an Electron app.

Recommended scope:

- Keep the existing `WindowContext` IPC flow for deciding which Electron window is being rendered.
- Do not route `capture` and `result` windows through React Router.
- Introduce React Router only inside the main window.
- Replace `MainShell`'s local `activeView` state with URL-driven routes.

Suggested target structure:

```tsx
function App() {
  const context = useWindowContext();

  if (context.type === "capture") {
    return <CaptureOverlay displayId={context.displayId} />;
  }

  if (context.type === "result") {
    return <ResultOverlay historyId={context.historyId} />;
  }

  return <MainAppRouter />;
}
```

Inside the main window:

```tsx
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

function MainAppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/settings" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/updates" element={<UpdatesPage />} />
      </Routes>
    </HashRouter>
  );
}
```

Why `HashRouter`:

- Electron production builds usually load the renderer through `file://.../index.html`.
- `HashRouter` works reliably with `file://` URLs.
- `BrowserRouter` is more likely to cause refresh/deep-link issues in packaged Electron apps.

Implementation notes:

- Add `react-router-dom`.
- Split `MainShell` into route-friendly pieces if needed:
  - `SettingsPage`
  - `HistoryPage`
  - `UpdatesPage`
- Replace Mantine navigation click handlers with router navigation.
- Use React Router `NavLink` or `useLocation` to drive selected navigation state.
- Keep E2E tests focused on user-facing behavior, but update route expectations if URLs become part of the contract.

Non-goals:

- Do not rewrite Electron window creation.
- Do not remove `WindowContext`.
- Do not route screenshot overlay or result popup as normal app pages.
- Do not combine this with unrelated UI redesign work.

## ResultWindow Interaction Follow-Up

Requirements:

- Let `ResultWindow` be resizable.
- Let `ResultWindow` be draggable, but clamp movement so it cannot move beyond the current display bounds.
