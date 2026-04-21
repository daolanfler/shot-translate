import path from "node:path";
import { BrowserWindow, shell } from "electron";
import type { WindowContext } from "../../shared/types";

const isDev = !process.env.APP_PACKAGED;

function buildUrl(hash: string) {
  if (isDev) {
    return `http://localhost:5173/${hash}`;
  }

  return `file://${path.join(__dirname, "../../dist/index.html")}${hash}`;
}

export function createMainWindow(onReady: (window: BrowserWindow, context: WindowContext) => void) {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: "Shot Translate",
    backgroundColor: "#0d1117",
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  onReady(window, { type: "main" });
  window.loadURL(buildUrl("#/"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return window;
}
