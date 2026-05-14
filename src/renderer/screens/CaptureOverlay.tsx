import { useEffect, useRef, useState } from "react";
import { clamp } from "../../shared/geometry";
import type { CaptureSourcePayload } from "../../shared/types";

interface Point {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Visual dimensions used to lay out the live size chip next to the selection.
// CHIP_HEIGHT matches the rendered height of the chip (12px font × 1.4
// line-height + 2 × 3px vertical padding ≈ 22px). CHIP_GAP is the small
// breathing room between the selection edge and the chip on any side.
const CHIP_HEIGHT = 22;
const CHIP_GAP = 6;
const CHIP_MIN_WIDTH_AT_RIGHT = 90;

function normalizeRect(start: Point, end: Point): Rect {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { left, top, width, height };
}

export function CaptureOverlay({ displayId }: { displayId: number }) {
  const [source, setSource] = useState<CaptureSourcePayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragEnd, setDragEnd] = useState<Point | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    window.shotTranslate
      .getCaptureSource(displayId)
      .then((nextSource) => {
        if (!mounted) {
          return;
        }

        if (!nextSource.dataUrl) {
          setErrorMessage("Failed to capture this display. Press Esc to cancel.");
          return;
        }

        setSource(nextSource);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? `Failed to capture this display: ${error.message}`
            : "Failed to capture this display. Press Esc to cancel."
        );
      });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void window.shotTranslate.cancelCapture();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [displayId]);

  async function submitSelection(rect: Rect) {
    if (!source || !containerRef.current) {
      return;
    }

    if (rect.width < 12 || rect.height < 12) {
      return;
    }

    const image = new Image();
    image.src = source.dataUrl;
    await image.decode();

    const renderedWidth = containerRef.current.clientWidth;
    const renderedHeight = containerRef.current.clientHeight;
    const scaleX = image.width / renderedWidth;
    const scaleY = image.height / renderedHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(rect.width * scaleX));
    canvas.height = Math.max(1, Math.floor(rect.height * scaleY));

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.drawImage(
      image,
      rect.left * scaleX,
      rect.top * scaleY,
      rect.width * scaleX,
      rect.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    await window.shotTranslate.submitCapture({
      displayId,
      imageDataUrl: canvas.toDataURL("image/png"),
      // Translate rect (CSS px, capture-window relative) into screen-space
      // (CSS px, display-relative) so main can anchor the result window.
      selectionRect: {
        x: window.screenX + rect.left,
        y: window.screenY + rect.top,
        width: rect.width,
        height: rect.height
      }
    });
  }

  const rect = dragStart && dragEnd ? normalizeRect(dragStart, dragEnd) : null;
  const isReady = Boolean(source && !errorMessage);

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen bg-cover bg-no-repeat cursor-crosshair"
      style={source ? { backgroundImage: `url(${source.dataUrl})` } : undefined}
      onMouseDown={(event) => {
        if (!isReady) {
          return;
        }

        setDragStart({ x: event.clientX, y: event.clientY });
        setDragEnd({ x: event.clientX, y: event.clientY });
      }}
      onMouseMove={(event) => {
        if (!dragStart) {
          return;
        }

        setDragEnd({ x: event.clientX, y: event.clientY });
      }}
      onMouseUp={async (event) => {
        if (!dragStart) {
          return;
        }

        const nextRect = normalizeRect(dragStart, { x: event.clientX, y: event.clientY });
        setDragStart(null);
        setDragEnd(null);
        await submitSelection(nextRect);
      }}
    >
      {isReady ? (
        <div className="absolute inset-0 bg-slate-900/15" />
      ) : (
        <div className="absolute inset-0 bg-slate-900/35" />
      )}

      {isReady ? (
        <div className="absolute left-1/2 top-6 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/70 bg-card/90 px-4 py-2 text-sm shadow-lg backdrop-blur-md">
          <strong className="font-semibold">Drag to select a region</strong>
          <span className="text-muted-foreground">Press Esc to cancel</span>
        </div>
      ) : (
        <div className="absolute left-1/2 top-1/2 z-10 flex w-[min(420px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-5 text-center shadow-xl backdrop-blur">
          <strong className="text-md font-semibold">
            {errorMessage ? "Capture failed" : "Preparing screenshot…"}
          </strong>
          <span className="text-sm text-muted-foreground">
            {errorMessage || "Press Esc to cancel if this takes too long."}
          </span>
        </div>
      )}

      {rect ? (
        <>
          <div
            className="absolute z-[2] border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }}
          />
          {rect.width >= 4 && rect.height >= 4 ? (
            <div
              className="pointer-events-none absolute z-[3] whitespace-nowrap rounded bg-slate-900/85 px-2 py-0.5 font-mono text-xs font-semibold text-slate-50"
              style={{
                left: clamp(
                  rect.left + rect.width + CHIP_GAP,
                  0,
                  window.innerWidth - CHIP_MIN_WIDTH_AT_RIGHT
                ),
                top:
                  rect.top + rect.height + CHIP_GAP + CHIP_HEIGHT > window.innerHeight
                    ? Math.max(0, rect.top - CHIP_HEIGHT - CHIP_GAP)
                    : rect.top + rect.height + CHIP_GAP
              }}
            >
              {Math.round(rect.width)} × {Math.round(rect.height)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
