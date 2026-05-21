import { useEffect, useState, type CSSProperties } from "react";
import { ClipboardCopy, RotateCcw, X } from "lucide-react";
import type { HistoryItem } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function isBusyStatus(status: HistoryItem["status"]) {
  return status === "ocr_processing" || status === "translating" || status === "pending";
}

export function ResultOverlay({ historyId }: { historyId: string }) {
  const [item, setItem] = useState<HistoryItem | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const next = await window.shotTranslate.getHistoryItem(historyId);
    setItem(next);
    if (next) {
      setSourceDraft((current) => current || next.sourceText);
    }
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
        Loading result...
      </div>
    );
  }

  const hasError = item.status === "error" || item.status === "ocr_failed";
  const isBusy = isBusyStatus(item.status);
  const canRetry = sourceDraft.trim().length > 0 && !isBusy;

  return (
    <div className="grid h-full place-items-center bg-transparent p-4">
      <Card className="flex h-full max-h-[390px] w-full max-w-[480px] gap-0 overflow-hidden p-0 shadow-xl">
        <header
          className="flex items-center justify-between gap-2 border-b px-4 py-3"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Translation
            </p>
            <p className="text-xs text-muted-foreground">
              {isBusy ? "Working..." : hasError ? "Needs attention" : "Ready"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            onClick={() => window.shotTranslate.closeResultWindow()}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="bg-muted/50 px-4 py-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Source
              </span>
              <textarea
                className="min-h-24 resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={sourceDraft}
                placeholder={item.errorMessage || "No text was captured."}
                onChange={(event) => setSourceDraft(event.target.value)}
              />
            </label>
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
        </div>

        {message ? (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            {message}
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!sourceDraft.trim()}
            onClick={async () => {
              await window.shotTranslate.writeClipboardText(sourceDraft);
              setMessage("Source copied.");
            }}
          >
            <ClipboardCopy className="size-3.5" />
            Source
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={canRetry === false}
            onClick={async () => {
              const next = await window.shotTranslate.retryHistoryItem(historyId, sourceDraft);
              setItem(next);
              setMessage(next ? "Translation retried." : "Retry failed.");
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
              setMessage("Translation copied.");
            }}
          >
            <ClipboardCopy className="size-3.5" />
            Translation
          </Button>
        </footer>
      </Card>
    </div>
  );
}
