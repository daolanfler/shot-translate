import path from "node:path";
import { BrowserWindow } from "electron";
import type { WindowContext } from "../../shared/types";

const isDev = !process.env.APP_PACKAGED;

function buildUrl(hash: string) {
  if (isDev) {
    return `http://localhost:5173/${hash}`;
  }

  return `file://${path.join(__dirname, "../../dist/index.html")}${hash}`;
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
      preload: path.join(__dirname, "../../preload/index.js"),
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
