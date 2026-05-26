import path from "node:path";
import { BrowserWindow, shell } from "electron";
import type { WindowContext } from "../../shared/types";

function buildUrl(hash: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    return `${devUrl}/${hash}`;
  }

  return `file://${path.join(__dirname, "../renderer/index.html")}${hash}`;
}

export function createMainWindow(onReady: (window: BrowserWindow, context: WindowContext) => void) {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: "Shot Translate",
    autoHideMenuBar: true,
    backgroundColor: "#f8f9fa",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
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
