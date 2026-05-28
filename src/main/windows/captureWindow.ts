import path from "node:path";
import { BrowserWindow, type Display } from "electron";
import type { WindowContext } from "../../shared/types";
import { openAllowedExternalUrl } from "./externalUrl";

function buildUrl(hash: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    return `${devUrl}/${hash}`;
  }

  return `file://${path.join(__dirname, "../renderer/index.html")}${hash}`;
}

export function createCaptureWindow(
  display: Display,
  onReady: (window: BrowserWindow, context: WindowContext) => void
) {
  const captureBounds = display.workArea;
  const window = new BrowserWindow({
    x: captureBounds.x,
    y: captureBounds.y,
    width: captureBounds.width,
    height: captureBounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: true,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setFullScreenable(false);
  onReady(window, { type: "capture", displayId: display.id });
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
  });
  window.loadURL(buildUrl("#/capture"));
  window.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternalUrl(url);
    return { action: "deny" };
  });

  return window;
}
