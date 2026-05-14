import { useEffect, useState } from "react";
import { ClipboardCopy, RotateCcw, X } from "lucide-react";
import type { HistoryItem } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
    return (
      <div className="grid h-full place-items-center bg-transparent text-sm text-muted-foreground">
        Loading result…
      </div>
    );
  }

  const hasError = item.status === "error" || item.status === "ocr_failed";
  const isBusy = item.status === "ocr_processing" || item.status === "translating";

  return (
    <div className="grid h-full place-items-center bg-transparent p-4">
      <Card className="w-full max-w-[480px] gap-0 overflow-hidden p-0 shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Translation
            </p>
            <p className="text-xs text-muted-foreground">
              {isBusy ? "Working…" : hasError ? "Needs attention" : "Ready"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => window.shotTranslate.closeResultWindow()}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>

        <section className="bg-muted/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Source
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
            {item.sourceText || item.errorMessage || "No text was captured."}
          </p>
        </section>

        <section className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Translation
          </p>
          <p
            className={
              hasError
                ? "mt-1 text-base leading-relaxed text-destructive whitespace-pre-wrap break-words"
                : "mt-1 text-base font-medium leading-relaxed whitespace-pre-wrap break-words"
            }
          >
            {item.translatedText || item.errorMessage || "No translation available."}
          </p>
        </section>

        {message ? (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            {message}
          </div>
        ) : null}

        <footer className="flex items-center justify-end gap-2 border-t bg-muted/30 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!item.sourceText || isBusy}
            onClick={async () => {
              const next = await window.shotTranslate.retryHistoryItem(historyId);
              setItem(next);
              setMessage("Translation retried.");
            }}
          >
            <RotateCcw className="size-3.5" />
            Retry
          </Button>
          <Button
            size="sm"
            disabled={!item.translatedText}
            onClick={async () => {
              await window.shotTranslate.writeClipboardText(item.translatedText);
              setMessage("Copied to clipboard.");
            }}
          >
            <ClipboardCopy className="size-3.5" />
            Copy
          </Button>
        </footer>
      </Card>
    </div>
  );
}
