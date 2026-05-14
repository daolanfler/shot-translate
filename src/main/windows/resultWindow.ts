import path from "node:path";
import { BrowserWindow, screen } from "electron";
import type { ScreenRect, WindowContext } from "../../shared/types";

const WINDOW_WIDTH = 520;
const WINDOW_HEIGHT = 420;
const ANCHOR_GAP = 12;

function buildUrl(hash: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    return `${devUrl}/${hash}`;
  }

  return `file://${path.join(__dirname, "../renderer/index.html")}${hash}`;
}

/**
 * Pick a position for the result window so it sits next to the captured
 * region without going off-screen. We try four anchor points around the
 * selection (right-bottom → left-bottom → right-top → left-top), then fall
 * back to the cursor's display work-area center if none fit.
 */
function pickPosition(anchor: ScreenRect | undefined): { x: number; y: number } {
  if (!anchor) {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    return {
      x: Math.round(x + (width - WINDOW_WIDTH) / 2),
      y: Math.round(y + (height - WINDOW_HEIGHT) / 2)
    };
  }

  const display = screen.getDisplayMatching(anchor);
  const work = display.workArea;
  const candidates: Array<{ x: number; y: number }> = [
    // Right-bottom of selection (preferred)
    { x: anchor.x + anchor.width + ANCHOR_GAP, y: anchor.y + anchor.height + ANCHOR_GAP },
    // Left-bottom
    { x: anchor.x - WINDOW_WIDTH - ANCHOR_GAP, y: anchor.y + anchor.height + ANCHOR_GAP },
    // Right-top
    { x: anchor.x + anchor.width + ANCHOR_GAP, y: anchor.y - WINDOW_HEIGHT - ANCHOR_GAP },
    // Left-top
    { x: anchor.x - WINDOW_WIDTH - ANCHOR_GAP, y: anchor.y - WINDOW_HEIGHT - ANCHOR_GAP }
  ];

  const fits = candidates.find(
    (p) =>
      p.x >= work.x &&
      p.y >= work.y &&
      p.x + WINDOW_WIDTH <= work.x + work.width &&
      p.y + WINDOW_HEIGHT <= work.y + work.height
  );

  if (fits) {
    return fits;
  }

  // Nothing fits cleanly — clamp the preferred (right-bottom) into work area.
  const preferred = candidates[0];
  return {
    x: Math.max(work.x, Math.min(preferred.x, work.x + work.width - WINDOW_WIDTH)),
    y: Math.max(work.y, Math.min(preferred.y, work.y + work.height - WINDOW_HEIGHT))
  };
}

export function createResultWindow(
  historyId: string,
  onReady: (window: BrowserWindow, context: WindowContext) => void,
  anchor?: ScreenRect
) {
  const position = pickPosition(anchor);

  const window = new BrowserWindow({
    x: position.x,
    y: position.y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 420,
    minHeight: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  onReady(window, { type: "result", historyId });
  window.loadURL(buildUrl("#/result"));
  window.show();

  return window;
}
