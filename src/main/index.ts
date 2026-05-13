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
import {
  clearHistory,
  createHistoryItem,
  flushHistory,
  getHistoryItem,
  listHistory,
  updateHistoryItem
} from "./services/history";
import { getSettings, updateSettings } from "./services/settings";
import { initLogger, log } from "./services/logger";
import { recognizeText, terminateOcrWorker } from "./services/ocr";
import { translateText } from "./services/translator";
import { createCaptureWindow } from "./windows/captureWindow";
import { createMainWindow } from "./windows/mainWindow";
import { createResultWindow } from "./windows/resultWindow";

initLogger();

type WorkflowState = "idle" | "capturing" | "processing";

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let resultWindow: BrowserWindow | null = null;
let captureWindows: BrowserWindow[] = [];
let workflowState: WorkflowState = "idle";
const windowContexts = new Map<number, WindowContext>();

function setWorkflowState(next: WorkflowState, message?: string) {
  workflowState = next;
  updateWorkflowStatus(next !== "idle", message);
}

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

  const sourceSize = source.thumbnail.getSize();
  const scaleX = sourceSize.width / display.bounds.width;
  const scaleY = sourceSize.height / display.bounds.height;
  const cropLeft = Math.round((display.workArea.x - display.bounds.x) * scaleX);
  const cropTop = Math.round((display.workArea.y - display.bounds.y) * scaleY);
  const cropRight = Math.round((display.workArea.x - display.bounds.x + display.workArea.width) * scaleX);
  const cropBottom = Math.round((display.workArea.y - display.bounds.y + display.workArea.height) * scaleY);
  const cropRect = {
    x: Math.max(0, Math.min(sourceSize.width - 1, cropLeft)),
    y: Math.max(0, Math.min(sourceSize.height - 1, cropTop)),
    width: Math.max(1, Math.min(sourceSize.width, cropRight) - Math.max(0, Math.min(sourceSize.width - 1, cropLeft))),
    height: Math.max(1, Math.min(sourceSize.height, cropBottom) - Math.max(0, Math.min(sourceSize.height - 1, cropTop)))
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
    setWorkflowState("idle");
  }
}

async function startCaptureFlow() {
  if (workflowState !== "idle") {
    updateWorkflowStatus(true, "Finish the current OCR/translation before starting another capture");
    return;
  }

  setWorkflowState("capturing", "Select an area to capture");
  const displays = screen.getAllDisplays();
  captureWindows = displays.map((display) => createCaptureWindow(display, setWindowContext));

  for (const window of captureWindows) {
    window.once("closed", () => {
      captureWindows = captureWindows.filter((candidate) => candidate !== window);
      // Only return to idle if we were still in the capture phase. If state is
      // already "processing" (i.e. user submitted), processCaptureResult owns
      // the transition back to idle.
      if (captureWindows.length === 0 && workflowState === "capturing") {
        setWorkflowState("idle");
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
  ipcMain.handle("history:clear", async () => {
    await clearHistory();
    broadcast({ type: "history-updated" });
    return listHistory();
  });
  ipcMain.handle("history:retry", (_event, id: string) => retryHistoryItem(id));

  ipcMain.handle("capture:start", () => startCaptureFlow());
  ipcMain.handle("capture:source", (_event, displayId: number) => getCaptureSource(displayId));
  ipcMain.handle("capture:submit", async (_event, payload: CaptureSubmitPayload) => {
    // Transition before close so the window.closed listener sees "processing"
    // and does not reset to idle.
    setWorkflowState("processing", "Running OCR");
    closeCaptureWindows();
    await processCaptureResult(payload.imageDataUrl);
    return true;
  });
  ipcMain.handle("capture:cancel", () => {
    // closeCaptureWindows triggers window.closed, which resets state to idle.
    closeCaptureWindows();
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
  ipcMain.handle("log:rendererError", (_event, payload: { message: string; stack?: string }) => {
    log.error(`[renderer] ${payload.message}`, payload.stack ?? "");
    return true;
  });
}

let quitting = false;
let cleaningUp = false;

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

app.on("before-quit", (event) => {
  quitting = true;

  if (cleaningUp) {
    return;
  }

  cleaningUp = true;
  event.preventDefault();
  void Promise.allSettled([terminateOcrWorker(), flushHistory()]).finally(() => {
    app.quit();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
