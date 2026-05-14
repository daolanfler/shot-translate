import { useEffect, useState } from "react";
import type { WindowContext } from "../shared/types";
import { CaptureOverlay } from "./screens/CaptureOverlay";
import { MainShell } from "./screens/MainShell";
import { ResultOverlay } from "./screens/ResultOverlay";

export function App() {
  const [context, setContext] = useState<WindowContext | null>(null);

  useEffect(() => {
    window.shotTranslate.getWindowContext().then(setContext);
  }, []);

  if (!context) {
    return (
      <div className="grid h-full place-items-center bg-background text-sm text-muted-foreground">
        Loading Shot Translate…
      </div>
    );
  }

  if (context.type === "capture") {
    return <CaptureOverlay displayId={context.displayId} />;
  }

  if (context.type === "result") {
    return <ResultOverlay historyId={context.historyId} />;
  }

  return <MainShell />;
}

