import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen
} from "electron";
import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  HistoryItem,
  WindowContext
} from "../shared/types";
import { clearHistory, createHistoryItem, getHistoryItem, listHistory, updateHistoryItem } from "./services/history";
import { getSettings, updateSettings } from "./services/settings";
import { recognizeText } from "./services/ocr";
import { translateText } from "./services/translator";
import { createCaptureWindow } from "./windows/captureWindow";
import { createMainWindow } from "./windows/mainWindow";
import { createResultWindow } from "./windows/resultWindow";

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let resultWindow: BrowserWindow | null = null;
let captureWindows: BrowserWindow[] = [];
let captureInProgress = false;
let workflowInProgress = false;
const windowContexts = new Map<number, WindowContext>();

function setWindowContext(window: BrowserWindow, context: WindowContext) {
  const webContentsId = window.webContents.id;
  windowContexts.set(webContentsId, context);
  window.on("closed", () => {
    windowContexts.delete(webContentsId);
  });
}

function getContextForSender(senderId: number) {
  return windowContexts.get(senderId) ?? { type: "main" as const };
}

function broadcast(event: AppEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("app:event", event);
    }
  }
}

function updateWorkflowStatus(busy: boolean, message?: string) {
  broadcast({
    type: "workflow-status",
    payload: {
      busy,
      message
    }
  });
}

function createTray() {
  const svg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="8" y="8" width="48" height="48" rx="12" fill="#121926"/><path d="M20 26h24M20 34h16M20 42h18" stroke="#faf6e6" stroke-width="4" stroke-linecap="round"/></svg>'
  );
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);

  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip("Shot Translate");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open",
        click: () => {
          showMainWindow();
        }
      },
      {
        label: "Capture and Translate",
        click: () => {
          void startCaptureFlow();
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => {
          app.quit();
        }
      }
    ])
  );
}

function showMainWindow() {
  if (!mainWindow) {
    mainWindow = createMainWindow(setWindowContext);
    mainWindow.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });
  }

  mainWindow.show();
  mainWindow.focus();
}

function registerShortcut(settings: AppSettings) {
  globalShortcut.unregisterAll();
  return globalShortcut.register(settings.shortcut, () => {
    void startCaptureFlow();
  });
}

function closeCaptureWindows() {
  for (const window of captureWindows) {
    if (!window.isDestroyed()) {
      window.close();
    }
  }

  captureWindows = [];
  captureInProgress = false;
}

async function getCaptureSource(displayId: number): Promise<CaptureSourcePayload> {
  const display = screen.getAllDisplays().find((item) => item.id === displayId);

  if (!display) {
    throw new Error(`Display ${displayId} was not found.`);
  }

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

  return {
    displayId,
    displayLabel: display.label || `Display ${displayId}`,
    dataUrl: source.thumbnail.toDataURL(),
    width: source.thumbnail.getSize().width,
    height: source.thumbnail.getSize().height
  };
}

function openResultWindow(item: HistoryItem) {
  if (resultWindow && !resultWindow.isDestroyed()) {
    resultWindow.close();
  }

  resultWindow = createResultWindow(item.id, setWindowContext);
}

async function processCaptureResult(imageDataUrl: string) {
  const settings = getSettings();
  const item = createHistoryItem(settings.targetLanguage);
  broadcast({ type: "history-updated" });
  updateWorkflowStatus(true, "Running OCR");

  try {
    updateHistoryItem(item.id, {
      status: "ocr_processing"
    });
    broadcast({ type: "history-updated" });

    const ocr = await recognizeText(imageDataUrl);

    if (!ocr.text) {
      const failed = updateHistoryItem(item.id, {
        status: "ocr_failed",
        errorMessage: "No text was detected in the screenshot."
      });
      broadcast({ type: "history-updated" });
      openResultWindow(failed ?? item);
      return;
    }

    updateHistoryItem(item.id, {
      sourceText: ocr.text,
      status: "translating",
      errorMessage: undefined
    });
    broadcast({ type: "history-updated" });
    updateWorkflowStatus(true, "Translating text");

    const translated = await translateText(ocr.text, settings);
    const completed = updateHistoryItem(item.id, {
      sourceText: ocr.text,
      translatedText: translated.translatedText,
      sourceLanguage: translated.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      status: "success",
      errorMessage: undefined
    });

    broadcast({ type: "history-updated" });
    openResultWindow(completed ?? item);
  } catch (error) {
    const failed = updateHistoryItem(item.id, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error"
    });

    broadcast({ type: "history-updated" });
    openResultWindow(failed ?? item);
  } finally {
    workflowInProgress = false;
    updateWorkflowStatus(false);
  }
}

async function startCaptureFlow() {
  if (workflowInProgress || captureInProgress) {
    updateWorkflowStatus(true, "Finish the current OCR/translation before starting another capture");
    return;
  }

  workflowInProgress = true;
  captureInProgress = true;
  updateWorkflowStatus(true, "Select an area to capture");
  const displays = screen.getAllDisplays();
  captureWindows = displays.map((display) => createCaptureWindow(display, setWindowContext));

  for (const window of captureWindows) {
    window.once("closed", () => {
      captureWindows = captureWindows.filter((candidate) => candidate !== window);
      if (captureWindows.length === 0) {
        captureInProgress = false;
        updateWorkflowStatus(false);
      }
    });
  }
}

async function retryHistoryItem(id: string) {
  const item = getHistoryItem(id);

  if (!item) {
    throw new Error("History item not found.");
  }

  if (!item.sourceText) {
    throw new Error("Cannot retry translation because OCR text is missing.");
  }

  const settings = getSettings();
  updateHistoryItem(id, {
    status: "translating",
    errorMessage: undefined
  });
  broadcast({ type: "history-updated" });

  try {
    const translated = await translateText(item.sourceText, settings);
    const completed = updateHistoryItem(id, {
      translatedText: translated.translatedText,
      sourceLanguage: translated.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      status: "success"
    });

    broadcast({ type: "history-updated" });
    return completed;
  } catch (error) {
    const failed = updateHistoryItem(id, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error"
    });

    broadcast({ type: "history-updated" });
    return failed;
  }
}

function installIpcHandlers() {
  ipcMain.handle("window:getContext", (event) => {
    return getContextForSender(event.sender.id);
  });

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:update", (_event, patch: Partial<AppSettings>) => {
    const settings = updateSettings(patch);
    const registered = registerShortcut(settings);

    broadcast({
      type: "settings-updated",
      payload: {
        message: registered
          ? "Shortcut registered successfully."
          : "Shortcut could not be registered. It may already be in use."
      }
    });

    return { settings, shortcutRegistered: registered };
  });

  ipcMain.handle("history:list", () => listHistory());
  ipcMain.handle("history:get", (_event, id: string) => getHistoryItem(id));
  ipcMain.handle("history:clear", () => {
    clearHistory();
    broadcast({ type: "history-updated" });
    return listHistory();
  });
  ipcMain.handle("history:retry", (_event, id: string) => retryHistoryItem(id));

  ipcMain.handle("capture:start", () => startCaptureFlow());
  ipcMain.handle("capture:source", (_event, displayId: number) => getCaptureSource(displayId));
  ipcMain.handle("capture:submit", async (_event, payload: CaptureSubmitPayload) => {
    closeCaptureWindows();
    await processCaptureResult(payload.imageDataUrl);
    return true;
  });
  ipcMain.handle("capture:cancel", () => {
    closeCaptureWindows();
    workflowInProgress = false;
    updateWorkflowStatus(false);
    return true;
  });

  ipcMain.handle("clipboard:writeText", (_event, text: string) => {
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle("result:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
}

let quitting = false;

app.whenReady().then(() => {
  createTray();
  installIpcHandlers();
  showMainWindow();
  registerShortcut(getSettings());

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
