import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconClipboard,
  IconLoader2,
  IconPencil,
  IconRefresh,
  IconX
} from "@tabler/icons-react";
import type { HistoryItem } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatActionError } from "@/lib/errors";

function isBusyStatus(status: HistoryItem["status"]) {
  return status === "ocr_processing" || status === "translating" || status === "pending";
}

function statusText(item: HistoryItem) {
  if (item.status === "translating") {
    return "正在翻译";
  }

  if (item.status === "ocr_processing") {
    return "OCR 识别中";
  }

  if (item.status === "success") {
    return "翻译完成";
  }

  if (item.status === "low_confidence") {
    return "OCR 置信度低，请核对原文";
  }

  if (item.status === "ocr_failed") {
    return "OCR 失败";
  }

  if (item.status === "error") {
    return "需要处理";
  }

  return "等待中";
}

export function ResultOverlay({ historyId }: { historyId: string }) {
  const [item, setItem] = useState<HistoryItem | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [editingSource, setEditingSource] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ pointerId: number; screenX: number; screenY: number } | null>(null);

  async function refresh(): Promise<void> {
    try {
      const next = await window.shotTranslate.getHistoryItem(historyId);
      setItem(next);
      if (next) {
        setSourceDraft((current) => current || next.sourceText);
      }
    } catch (error) {
      console.error("[ResultOverlay] Failed to load translation result", error);
      setMessage(formatActionError("加载结果失败", error));
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
      <div className="grid h-full place-items-center bg-transparent px-4 text-center text-sm text-muted-foreground">
        {message || "正在加载..."}
      </div>
    );
  }

  const hasError = item.status === "error" || item.status === "ocr_failed";
  const hasLowConfidence = item.status === "low_confidence";
  const isBusy = isBusyStatus(item.status);
  const hasSource = sourceDraft.trim().length > 0 || item.sourceText.trim().length > 0;
  const canRetry = hasSource && !isBusy;

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY
    };
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.screenX - dragState.screenX;
    const deltaY = event.screenY - dragState.screenY;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY
    };
    void window.shotTranslate.moveResultWindow({ deltaX, deltaY }).catch((error: unknown) => {
      console.error("[ResultOverlay] Failed to move result window", error);
    });
  }

  function stopDrag(event: PointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setDragging(false);
  }

  async function closeResultWindow(): Promise<void> {
    try {
      await window.shotTranslate.closeResultWindow();
    } catch (error) {
      console.error("[ResultOverlay] Failed to close result window", error);
      setMessage(formatActionError("关闭窗口失败", error));
    }
  }

  async function retryTranslation(sourceText: string): Promise<void> {
    try {
      const next = await window.shotTranslate.retryHistoryItem(historyId, sourceText);
      setItem(next);
      setEditingSource(false);
      setMessage(next ? "已重新提交翻译。" : "重新翻译失败。");
    } catch (error) {
      console.error("[ResultOverlay] Failed to retry translation", error);
      setMessage(formatActionError("重新翻译失败", error));
    }
  }

  async function copyText(text: string, successMessage: string): Promise<void> {
    try {
      await window.shotTranslate.writeClipboardText(text);
      setMessage(successMessage);
    } catch (error) {
      console.error("[ResultOverlay] Failed to copy text", error);
      setMessage(formatActionError("复制失败", error));
    }
  }

  return (
    <div className="grid h-full place-items-center bg-transparent">
      <section className="flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
        <header
          className={cn(
            "flex cursor-move select-none items-center justify-between gap-2 border-b bg-white px-4 py-3",
            dragging && "cursor-grabbing"
          )}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-xl",
                hasError
                  ? "bg-red-50 text-red-600"
                  : hasLowConfidence
                    ? "bg-yellow-50 text-yellow-700"
                    : isBusy
                      ? "bg-blue-50 text-blue-600"
                      : "bg-emerald-50 text-emerald-600"
              )}
            >
              {isBusy ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : hasLowConfidence ? (
                <IconAlertTriangle className="size-4" />
              ) : (
                <IconCheck className="size-4" />
              )}
            </span>
            <div>
              <p className="text-sm font-semibold">截图翻译</p>
              <p className="text-xs text-muted-foreground">{statusText(item)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void closeResultWindow()}
            aria-label="关闭"
          >
            <IconX className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">原文</p>
              {item.ocrConfidence !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    hasLowConfidence ? "bg-yellow-100 text-yellow-800" : "bg-slate-200 text-slate-600"
                  )}
                >
                  OCR {Math.round(item.ocrConfidence)}%
                </span>
              ) : null}
              {!editingSource && item.sourceText ? (
                <Button variant="ghost" size="xs" disabled={isBusy} onClick={() => setEditingSource(true)}>
                  <IconPencil className="size-3" />
                  编辑原文
                </Button>
              ) : null}
            </div>
            {editingSource ? (
              <textarea
                className="min-h-28 w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={sourceDraft}
                placeholder="暂无原文"
                onChange={(event) => setSourceDraft(event.target.value)}
              />
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {item.sourceText || item.errorMessage || "暂无原文"}
              </p>
            )}
          </div>

          <div className="mt-3 rounded-2xl border px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">译文</p>
            {item.status === "translating" ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <IconLoader2 className="size-4 animate-spin text-primary" />
                正在翻译...
              </div>
            ) : (
              <p
                className={cn(
                  "whitespace-pre-wrap break-words text-base leading-relaxed",
                  hasError ? "text-red-600" : "font-medium"
                )}
              >
                {item.translatedText || item.errorMessage || "暂无译文"}
              </p>
            )}
          </div>
        </div>

        {message ? (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            {message}
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-slate-50 px-4 py-3">
          {editingSource ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSourceDraft(item.sourceText);
                  setEditingSource(false);
                }}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={!canRetry}
                onClick={() => void retryTranslation(sourceDraft)}
              >
                <IconRefresh className="size-3.5" />
                重新翻译
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasSource}
                onClick={() => void copyText(item.sourceText || sourceDraft, "已复制原文。")}
              >
                <IconClipboard className="size-3.5" />
                复制原文
              </Button>
              {(hasError || hasLowConfidence) && hasSource ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canRetry}
                  onClick={() => void retryTranslation(sourceDraft || item.sourceText)}
                >
                  <IconRefresh className="size-3.5" />
                  重新翻译
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={!item.translatedText || isBusy}
                onClick={() => void copyText(item.translatedText, "已复制译文。")}
              >
                <IconClipboard className="size-3.5" />
                复制译文
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
