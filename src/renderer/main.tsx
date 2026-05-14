import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./globals.css";

window.addEventListener("error", (event) => {
  void window.shotTranslate?.reportRendererError({
    message: event.message,
    stack: event.error instanceof Error ? event.error.stack : undefined
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  void window.shotTranslate?.reportRendererError({
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

