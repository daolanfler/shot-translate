import path from "node:path";
import { BrowserWindow, type Display } from "electron";
import type { WindowContext } from "../../shared/types";

const isDev = !process.env.APP_PACKAGED;

function buildUrl(hash: string) {
  if (isDev) {
    return `http://localhost:5173/${hash}`;
  }

  return `file://${path.join(__dirname, "../../dist/index.html")}${hash}`;
}

export function createCaptureWindow(
  display: Display,
  onReady: (window: BrowserWindow, context: WindowContext) => void
) {
  const window = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setFullScreenable(false);
  onReady(window, { type: "capture", displayId: display.id });
  window.loadURL(buildUrl("#/capture"));

  return window;
}
