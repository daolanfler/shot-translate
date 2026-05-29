import path from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  screen
} from "electron";
import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  HistoryItem,
  ResultWindowMovePayload,
  ScreenRect,
  WindowContext
} from "../shared/types";
import {
  createHistoryItem,
  flushHistory,
  getHistoryItem,
  updateHistoryItem
} from "./services/history";
import { getSettings } from "./services/settings";
import { initLogger, log } from "./services/logger";
import { recognizeText, terminateOcrWorker } from "./services/ocr";
import { toUserMessage, translateText } from "./services/translator";
import { E2eHarness, isE2eMode } from "./testing/e2eHarness";
import { UpdateService } from "./services/updateService";
import { createCaptureWindow } from "./windows/captureWindow";
import { createMainWindow } from "./windows/mainWindow";
import { createResultWindow } from "./windows/resultWindow";
import { cropCaptureSourceToDataUrl } from "./services/captureCrop";
import { buildCaptureSource } from "./services/captureSource";
import { createSettingsUpdateManager } from "./services/settingsUpdateManager";
import { createShortcutRegistrar } from "./services/shortcut";
import { installIpcHandlers } from "./ipcHandlers";

type WorkflowState = "idle" | "capturing" | "processing";
type OcrProgressCallback = (message: string) => void;

const IS_E2E = isE2eMode();
const LOW_OCR_CONFIDENCE_THRESHOLD = 70;
const e2eUserDataDir = process.env.SHOT_TRANSLATE_USER_DATA_DIR;
if (IS_E2E && e2eUserDataDir) {
  app.setPath("userData", path.resolve(process.cwd(), e2eUserDataDir));
}

const remoteDebuggingPort = process.env.SHOT_TRANSLATE_REMOTE_DEBUGGING_PORT;
if (remoteDebuggingPort) {
  app.commandLine.appendSwitch("remote-debugging-port", remoteDebuggingPort);
  app.commandLine.appendSwitch("remote-allow-origins", "*");
}

initLogger();

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let resultWindow: BrowserWindow | null = null;
let captureWindows: BrowserWindow[] = [];
let captureSourceCache = new Map<number, CaptureSourcePayload>();
let workflowState: WorkflowState = "idle";
let updateService: UpdateService | null = null;
const e2eHarness = IS_E2E ? new E2eHarness() : null;
const windowContexts = new Map<number, WindowContext>();
const shortcutRegistrar = createShortcutRegistrar({
  onCapture: () => {
    void startCaptureFlow();
  }
});
const settingsUpdateManager = createSettingsUpdateManager({
  isE2e: IS_E2E,
  shortcutRegistrar
});

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

function requireUpdateService(): UpdateService {
  if (!updateService) {
    throw new Error("Update service has not been initialized.");
  }

  return updateService;
}

async function recognizeTextForWorkflow(
  imageDataUrl: string,
  languages: string[],
  onProgress: OcrProgressCallback,
  preprocessingOptions?: AppSettings["ocrPreprocessing"]
) {
  if (e2eHarness) {
    return e2eHarness.recognizeText(onProgress);
  }

  return recognizeText(imageDataUrl, languages, onProgress, preprocessingOptions);
}

async function translateTextForWorkflow(text: string, settings: AppSettings) {
  if (e2eHarness) {
    return e2eHarness.translateText();
  }

  return translateText(text, settings);
}

function closeCaptureWindows() {
  for (const window of captureWindows) {
    if (!window.isDestroyed()) {
      window.close();
    }
  }

  captureWindows = [];
  captureSourceCache.clear();
}

async function getCaptureSource(displayId: number): Promise<CaptureSourcePayload> {
  const cached = captureSourceCache.get(displayId);

  if (cached) {
    return cached;
  }

  const display = screen.getAllDisplays().find((item) => item.id === displayId);

  if (!display) {
    throw new Error(`Display ${displayId} was not found.`);
  }

  return buildCaptureSource(display);
}

async function cropCaptureSelection(payload: CaptureSubmitPayload): Promise<string> {
  const source = await getCaptureSource(payload.displayId);
  const display = screen.getAllDisplays().find((item) => item.id === payload.displayId);

  if (!display) {
    throw new Error(`Display ${payload.displayId} was not found.`);
  }

  return cropCaptureSourceToDataUrl(source, payload.selectionRect, display.workArea);
}

function openResultWindow(item: HistoryItem, anchor?: ScreenRect) {
  if (resultWindow && !resultWindow.isDestroyed()) {
    resultWindow.close();
  }

  resultWindow = createResultWindow(item.id, setWindowContext, anchor);
}

function closeResultWindow() {
  if (resultWindow && !resultWindow.isDestroyed()) {
    resultWindow.close();
  }

  resultWindow = null;
}

function moveResultWindow(payload: ResultWindowMovePayload) {
  if (!resultWindow || resultWindow.isDestroyed()) {
    return false;
  }

  if (!Number.isFinite(payload.deltaX) || !Number.isFinite(payload.deltaY)) {
    return false;
  }

  const bounds = resultWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const work = display.workArea;
  const maxX = work.x + work.width - bounds.width;
  const maxY = work.y + work.height - bounds.height;

  resultWindow.setBounds({
    ...bounds,
    x: Math.round(Math.max(work.x, Math.min(bounds.x + payload.deltaX, maxX))),
    y: Math.round(Math.max(work.y, Math.min(bounds.y + payload.deltaY, maxY)))
  });

  return true;
}

async function processCaptureResult(imageDataUrl: string, selectionRect?: ScreenRect) {
  const settings = getSettings();
  const item = createHistoryItem(settings.targetLanguage);
  broadcast({ type: "history-updated" });
  updateWorkflowStatus(true, "Running OCR");

  try {
    updateHistoryItem(item.id, {
      status: "ocr_processing"
    });
    broadcast({ type: "history-updated" });

    const ocr = await recognizeTextForWorkflow(
      imageDataUrl,
      settings.ocrLanguages,
      (message) => {
        updateWorkflowStatus(true, message);
      },
      settings.ocrPreprocessing
    );

    if (!ocr.text) {
      const failed = updateHistoryItem(item.id, {
        status: "ocr_failed",
        errorMessage: "No text was detected in the screenshot."
      });
      broadcast({ type: "history-updated" });
      openResultWindow(failed ?? item, selectionRect);
      return;
    }

    const translating = updateHistoryItem(item.id, {
      sourceText: ocr.text,
      ocrConfidence: ocr.confidence,
      status: "translating",
      errorMessage: undefined
    });
    broadcast({ type: "history-updated" });
    openResultWindow(translating ?? item, selectionRect);
    updateWorkflowStatus(true, "Translating text");

    const translated = await translateTextForWorkflow(ocr.text, settings);
    const completed = updateHistoryItem(item.id, {
      sourceText: ocr.text,
      translatedText: translated.translatedText,
      sourceLanguage: translated.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      status: ocr.confidence < LOW_OCR_CONFIDENCE_THRESHOLD ? "low_confidence" : "success",
      ocrConfidence: ocr.confidence,
      errorMessage: undefined
    });
    broadcast({ type: "history-updated" });
  } catch (error) {
    log.error("Capture workflow failed.", error);
    const failed = updateHistoryItem(item.id, {
      status: "error",
      errorMessage: toUserMessage(error)
    });

    broadcast({ type: "history-updated" });
    if (!failed?.sourceText) {
      openResultWindow(failed ?? item, selectionRect);
    }
  } finally {
    setWorkflowState("idle");
  }
}

async function startCaptureFlow() {
  if (workflowState !== "idle") {
    updateWorkflowStatus(true, "Finish the current OCR/translation before starting another capture");
    return;
  }

  setWorkflowState("capturing", "Preparing capture");
  const displays = screen.getAllDisplays();

  try {
    const sources = await Promise.all(displays.map((display) => buildCaptureSource(display)));
    captureSourceCache = new Map(sources.map((source) => [source.displayId, source]));
  } catch (error) {
    log.error("Failed to prepare capture sources.", error);
    captureSourceCache.clear();
    setWorkflowState("idle");
    return;
  }

  updateWorkflowStatus(true, "Select an area to capture");
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

async function retryHistoryItem(id: string, sourceText?: string) {
  const item = getHistoryItem(id);

  if (!item) {
    throw new Error("History item not found.");
  }

  const nextSourceText = sourceText?.trim() ?? item.sourceText;

  if (!nextSourceText) {
    throw new Error("Cannot retry translation because OCR text is missing.");
  }

  const settings = getSettings();
  updateHistoryItem(id, {
    sourceText: nextSourceText,
    translatedText: "",
    ocrConfidence: undefined,
    status: "translating",
    errorMessage: undefined
  });
  broadcast({ type: "history-updated" });

  try {
    const translated = await translateTextForWorkflow(nextSourceText, settings);
    const completed = updateHistoryItem(id, {
      translatedText: translated.translatedText,
      sourceLanguage: translated.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      status: "success",
      ocrConfidence: undefined
    });

    broadcast({ type: "history-updated" });
    return completed;
  } catch (error) {
    log.error("Retry translation failed.", error);
    const failed = updateHistoryItem(id, {
      status: "error",
      errorMessage: toUserMessage(error)
    });

    broadcast({ type: "history-updated" });
    return failed;
  }
}

let quitting = false;
let cleaningUp = false;

app.whenReady().then(() => {
  updateService = new UpdateService(() => mainWindow);
  if (!IS_E2E) {
    createTray();
  }
  installIpcHandlers({
    e2eHarness,
    broadcast,
    getContextForSender,
    getResultWindow: () => resultWindow,
    requireUpdateService,
    updateSettingsSafely: settingsUpdateManager.updateSettingsSafely,
    getCaptureSource,
    startCaptureFlow,
    cropCaptureSelection,
    closeCaptureWindows,
    moveResultWindow,
    retryHistoryItem,
    setQuitting: () => {
      quitting = true;
    },
    getWorkflowState: () => workflowState,
    setWorkflowState,
    closeResultWindow,
    processCaptureResult
  });
  showMainWindow();
  if (!IS_E2E) {
    shortcutRegistrar.register(getSettings());
    updateService.startStartupCheck();
  }

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
  shortcutRegistrar.unregisterAll();
});
