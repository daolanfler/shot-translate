import path from "node:path";
import { BrowserWindow } from "electron";
import type { WindowContext } from "../../shared/types";

function buildUrl(hash: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    return `${devUrl}/${hash}`;
  }

  return `file://${path.join(__dirname, "../renderer/index.html")}${hash}`;
}

export function createResultWindow(
  historyId: string,
  onReady: (window: BrowserWindow, context: WindowContext) => void
) {
  const window = new BrowserWindow({
    width: 520,
    height: 420,
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
  window.center();
  window.show();

  return window;
}
