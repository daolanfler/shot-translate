import { useEffect, useState } from "react";
import { MantineProvider, createTheme } from "@mantine/core";
import { HashRouter } from "react-router-dom";
import type { WindowContext } from "../shared/types";
import { CaptureOverlay } from "./screens/CaptureOverlay";
import { MainShell } from "./screens/MainShell";
import { ResultOverlay } from "./screens/ResultOverlay";
import { formatActionError } from "./lib/errors";

const theme = createTheme({
  fontFamily:
    "Inter, 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', system-ui, sans-serif",
  primaryColor: "blue",
  defaultRadius: "md"
});

export function App() {
  const [context, setContext] = useState<WindowContext | null>(null);
  const [contextError, setContextError] = useState("");

  useEffect(() => {
    window.shotTranslate
      .getWindowContext()
      .then(setContext)
      .catch((error: unknown) => {
        console.error("[App] Failed to load window context", error);
        setContextError(formatActionError("Failed to load window context", error));
      });
  }, []);

  if (contextError) {
    return (
      <div className="grid h-full place-items-center bg-background p-6 text-sm text-red-600">
        {contextError}
      </div>
    );
  }

  if (!context) {
    return (
      <div className="grid h-full place-items-center bg-background text-sm text-muted-foreground">
        Loading Shot Translate…
      </div>
    );
  }

  if (context.type === "capture") {
    return (
      <MantineProvider theme={theme}>
        <div className="window-transparent-root">
          <CaptureOverlay displayId={context.displayId} />
        </div>
      </MantineProvider>
    );
  }

  if (context.type === "result") {
    return (
      <MantineProvider theme={theme}>
        <div className="window-transparent-root">
          <ResultOverlay historyId={context.historyId} />
        </div>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider theme={theme}>
      <HashRouter>
        <MainShell />
      </HashRouter>
    </MantineProvider>
  );
}

