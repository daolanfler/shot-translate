import { useEffect, useRef, useState } from "react";
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

function normalizeRect(start: Point, end: Point): Rect {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { left, top, width, height };
}

export function CaptureOverlay({ displayId }: { displayId: number }) {
  const [source, setSource] = useState<CaptureSourcePayload | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragEnd, setDragEnd] = useState<Point | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.shotTranslate.getCaptureSource(displayId).then(setSource);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void window.shotTranslate.cancelCapture();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      imageDataUrl: canvas.toDataURL("image/png")
    });
  }

  const rect = dragStart && dragEnd ? normalizeRect(dragStart, dragEnd) : null;

  return (
    <div
      ref={containerRef}
      className="capture-root"
      style={source ? { backgroundImage: `url(${source.dataUrl})` } : undefined}
      onMouseDown={(event) => {
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
      <div className="capture-hud">
        <strong>Drag to select a region</strong>
        <span>Press Esc to cancel</span>
      </div>
      {rect ? (
        <div
          className="capture-selection"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          }}
        />
      ) : null}
    </div>
  );
}

