import { desktopCapturer, type Display } from "electron";
import type { CaptureSourcePayload } from "../../shared/types";

export async function buildCaptureSource(display: Display): Promise<CaptureSourcePayload> {
  const displayId = display.id;
  const source = (
    await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.floor(display.bounds.width * display.scaleFactor),
        height: Math.floor(display.bounds.height * display.scaleFactor)
      }
    })
  ).find((candidate) => candidate.display_id === String(displayId));

  if (!source) {
    throw new Error(`Could not capture display ${displayId}.`);
  }

  const sourceSize = source.thumbnail.getSize();
  const scaleX = sourceSize.width / display.bounds.width;
  const scaleY = sourceSize.height / display.bounds.height;
  const cropLeft = Math.round((display.workArea.x - display.bounds.x) * scaleX);
  const cropTop = Math.round((display.workArea.y - display.bounds.y) * scaleY);
  const cropRight = Math.round((display.workArea.x - display.bounds.x + display.workArea.width) * scaleX);
  const cropBottom = Math.round((display.workArea.y - display.bounds.y + display.workArea.height) * scaleY);
  const x = Math.max(0, Math.min(sourceSize.width - 1, cropLeft));
  const y = Math.max(0, Math.min(sourceSize.height - 1, cropTop));
  const cropRect = {
    x,
    y,
    width: Math.max(1, Math.min(sourceSize.width, cropRight) - x),
    height: Math.max(1, Math.min(sourceSize.height, cropBottom) - y)
  };
  const thumbnail = source.thumbnail.crop(cropRect);

  return {
    displayId,
    displayLabel: display.label || `Display ${displayId}`,
    dataUrl: thumbnail.toDataURL(),
    width: thumbnail.getSize().width,
    height: thumbnail.getSize().height
  };
}
