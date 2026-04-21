import { useEffect, useState } from "react";
import type { HistoryItem } from "../../shared/types";

export function ResultOverlay({ historyId }: { historyId: string }) {
  const [item, setItem] = useState<HistoryItem | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    const next = await window.shotTranslate.getHistoryItem(historyId);
    setItem(next);
  }

  useEffect(() => {
    void refresh();

    return window.shotTranslate.onAppEvent((event) => {
      if (event.type === "history-updated") {
        void refresh();
      }
    });
  }, [historyId]);

  if (!item) {
    return <div className="result-shell">Loading result...</div>;
  }

  const hasError = item.status === "error" || item.status === "ocr_failed";

  return (
    <div className="result-shell">
      <div className="result-card">
        <header className="result-header">
          <div>
            <p className="eyebrow">Translation Result</p>
            <h2>{item.status === "success" ? "Ready" : "Needs attention"}</h2>
          </div>
          <button className="ghost-button" onClick={() => window.shotTranslate.closeResultWindow()}>
            Close
          </button>
        </header>

        <section className="result-section">
          <span>Source</span>
          <p>{item.sourceText || item.errorMessage || "No text was captured."}</p>
        </section>

        <section className="result-section">
          <span>Translation</span>
          <p className={hasError ? "result-error-message" : undefined}>
            {item.translatedText || item.errorMessage || "No translation available."}
          </p>
        </section>

        {message ? <div className="notice-banner">{message}</div> : null}

        <footer className="result-actions">
          <button
            className="secondary-button"
            disabled={!item.sourceText}
            onClick={async () => {
              const next = await window.shotTranslate.retryHistoryItem(historyId);
              setItem(next);
              setMessage("Translation retried.");
            }}
          >
            Retry
          </button>
          <button
            className="primary-button"
            disabled={!item.translatedText}
            onClick={async () => {
              await window.shotTranslate.writeClipboardText(item.translatedText);
              setMessage("Copied to clipboard.");
            }}
          >
            Copy
          </button>
        </footer>
      </div>
    </div>
  );
}
