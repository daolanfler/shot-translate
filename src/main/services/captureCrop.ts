import { nativeImage } from "electron";
import { clamp } from "../../shared/geometry";
import type { CaptureSourcePayload, ScreenRect } from "../../shared/types";

export interface WorkAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BitmapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateCaptureCropRect(
  selection: ScreenRect,
  workArea: WorkAreaRect,
  sourceSize: { width: number; height: number }
): BitmapRect {
  const scaleX = sourceSize.width / workArea.width;
  const scaleY = sourceSize.height / workArea.height;
  const left = Math.round((selection.x - workArea.x) * scaleX);
  const top = Math.round((selection.y - workArea.y) * scaleY);
  const right = Math.round((selection.x - workArea.x + selection.width) * scaleX);
  const bottom = Math.round((selection.y - workArea.y + selection.height) * scaleY);
  const x = clamp(left, 0, Math.max(0, sourceSize.width - 1));
  const y = clamp(top, 0, Math.max(0, sourceSize.height - 1));
  const maxRight = clamp(right, x + 1, sourceSize.width);
  const maxBottom = clamp(bottom, y + 1, sourceSize.height);

  return {
    x,
    y,
    width: Math.max(1, maxRight - x),
    height: Math.max(1, maxBottom - y)
  };
}

export function cropCaptureSourceToDataUrl(
  source: CaptureSourcePayload,
  selection: ScreenRect,
  workArea: WorkAreaRect
): string {
  const image = nativeImage.createFromDataURL(source.dataUrl);
  const sourceSize = image.getSize();
  const cropRect = calculateCaptureCropRect(selection, workArea, sourceSize);
  return image.crop(cropRect).toDataURL();
}
