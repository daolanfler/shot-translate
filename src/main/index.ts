import path from "node:path";
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
  screen,
  type Display
} from "electron";
import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  HistoryItem,
  ResultWindowMovePayload,
  ScreenRect,
  ServiceResult,
  WindowContext
} from "../shared/types";
import {
  clearHistory,
  createHistoryItem,
  deleteHistoryItem,
  flushHistory,
  getHistoryItem,
  listHistory,
  updateHistoryItem
} from "./services/history";
import { getSettings, updateSettings } from "./services/settings";
import { initLogger, log } from "./services/logger";
import { recognizeText, terminateOcrWorker } from "./services/ocr";
import { testTranslationConnection, toUserMessage, translateText } from "./services/translator";
import { E2eHarness, isE2eMode } from "./testing/e2eHarness";
import { UpdateService } from "./services/updateService";
import {
  validateCaptureSubmitPayload,
  validateClipboardText,
  validateHistoryId,
  validateRendererError,
  validateResultWindowMovePayload,
  validateRetrySourceText,
  validateSettingsPatch,
  validateUpdateSource
} from "./ipcValidation";
import { createCaptureWindow } from "./windows/captureWindow";
import { createMainWindow } from "./windows/mainWindow";
import { createResultWindow } from "./windows/resultWindow";
import { cropCaptureSourceToDataUrl } from "./services/captureCrop";

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

function requireUpdateService(): UpdateService {
  if (!updateService) {
    throw new Error("Update service has not been initialized.");
  }

  return updateService;
}

function isLikelyAccelerator(value: string) {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    return false;
  }

  const key = parts.at(-1);
  return Boolean(key && !["Alt", "Shift", "Control", "CommandOrControl", "CmdOrCtrl", "Command", "Super"].includes(key));
}

async function updateSettingsSafely(patch: Partial<AppSettings>): Promise<{
  settings: AppSettings;
  shortcutRegistered: boolean;
  message: string;
}> {
  const current = getSettings();

  if (typeof patch.shortcut === "string" && patch.shortcut !== current.shortcut) {
    const shortcut = patch.shortcut.trim();

    if (!isLikelyAccelerator(shortcut)) {
      return {
        settings: current,
        shortcutRegistered: false,
        message: "Shortcut is invalid. Use a key plus optional modifiers, for example Alt+S."
      };
    }

    globalShortcut.unregisterAll();
    const registered = globalShortcut.register(shortcut, () => {
      void startCaptureFlow();
    });

    if (!registered) {
      registerShortcut(current);
      return {
        settings: current,
        shortcutRegistered: false,
        message: "Shortcut could not be registered. It may already be in use."
      };
    }

    const settings = await updateSettings({
      ...patch,
      shortcut
    });
    return {
      settings,
      shortcutRegistered: true,
      message: "Settings saved."
    };
  }

  const settings = await updateSettings(patch);
  if (!IS_E2E) {
    registerShortcut(settings);
  }
  return {
    settings,
    shortcutRegistered: true,
    message: "Settings saved."
  };
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

async function buildCaptureSource(display: Display): Promise<CaptureSourcePayload> {
  const displayId = display.id;
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

function installIpcHandlers() {
  ipcMain.handle("window:getContext", (event) => {
    return getContextForSender(event.sender.id);
  });

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:update", async (_event, patch: unknown) => {
    const result = await updateSettingsSafely(validateSettingsPatch(patch));

    broadcast({
      type: "settings-updated",
      payload: {
        message: result.message
      }
    });

    return result;
  });
  ipcMain.handle("settings:testApiConnection", async (_event, patch: unknown): Promise<ServiceResult> => {
    const validatedPatch = validateSettingsPatch(patch);
    if (e2eHarness) {
      return e2eHarness.testApiConnection(validatedPatch);
    }

    const result = await testTranslationConnection({
      ...getSettings(),
      ...validatedPatch
    });

    if (!result.ok) {
      log.warn("API connection test failed.", result);
    }

    return result;
  });

  ipcMain.handle("history:list", () => listHistory());
  ipcMain.handle("history:get", (_event, id: unknown) => getHistoryItem(validateHistoryId(id)));
  ipcMain.handle("history:clear", async () => {
    await clearHistory();
    broadcast({ type: "history-updated" });
    return listHistory();
  });
  ipcMain.handle("history:delete", async (_event, id: unknown) => {
    await deleteHistoryItem(validateHistoryId(id));
    broadcast({ type: "history-updated" });
    return listHistory();
  });
  ipcMain.handle("history:retry", (_event, id: unknown, sourceText?: unknown) =>
    retryHistoryItem(validateHistoryId(id), validateRetrySourceText(sourceText))
  );

  ipcMain.handle("updates:get-state", () => {
    return requireUpdateService().getState();
  });

  ipcMain.handle("updates:get-settings", () => {
    return requireUpdateService().getSettings();
  });

  ipcMain.handle("updates:set-source", (_event, source: unknown) => {
    return requireUpdateService().setSource(validateUpdateSource(source));
  });

  ipcMain.handle("updates:check", () => {
    return requireUpdateService().checkForUpdates();
  });

  ipcMain.handle("updates:download", () => {
    return requireUpdateService().downloadUpdate();
  });

  ipcMain.handle("updates:install", () => {
    quitting = true;
    requireUpdateService().installUpdate();
  });

  ipcMain.handle("capture:start", () => startCaptureFlow());
  ipcMain.handle("capture:source", (_event, displayId: unknown) => {
    if (typeof displayId !== "number" || !Number.isInteger(displayId)) {
      throw new Error("displayId must be an integer.");
    }

    return getCaptureSource(displayId);
  });
  ipcMain.handle("capture:submit", async (event, payload: unknown) => {
    const validatedPayload = validateCaptureSubmitPayload(payload);
    const context = getContextForSender(event.sender.id);
    if (context.type !== "capture" || context.displayId !== validatedPayload.displayId) {
      throw new Error("Capture submission did not come from the selected display.");
    }

    const imageDataUrl = await cropCaptureSelection(validatedPayload);
    // Transition before close so the window.closed listener sees "processing"
    // and does not reset to idle.
    setWorkflowState("processing", "Running OCR");
    closeCaptureWindows();
    await processCaptureResult(imageDataUrl, validatedPayload.selectionRect);
    return true;
  });
  ipcMain.handle("capture:cancel", () => {
    // closeCaptureWindows triggers window.closed, which resets state to idle.
    closeCaptureWindows();
    return true;
  });

  ipcMain.handle("clipboard:writeText", (_event, text: unknown) => {
    clipboard.writeText(validateClipboardText(text));
    return true;
  });
  ipcMain.handle("result:move", (event, payload: unknown) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow !== resultWindow || getContextForSender(event.sender.id).type !== "result") {
      return false;
    }

    return moveResultWindow(validateResultWindowMovePayload(payload));
  });
  ipcMain.handle("result:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
  ipcMain.handle("log:rendererError", (_event, payload: unknown) => {
    const rendererError = validateRendererError(payload);
    log.error(`[renderer] ${rendererError.message}`, rendererError.stack ?? "");
    return true;
  });

  e2eHarness?.installIpcHandlers({
    getWorkflowState: () => workflowState,
    setWorkflowState,
    closeCaptureWindows,
    closeResultWindow,
    processCaptureResult
  });
}

let quitting = false;
let cleaningUp = false;

app.whenReady().then(() => {
  updateService = new UpdateService(() => mainWindow);
  if (!IS_E2E) {
    createTray();
  }
  installIpcHandlers();
  showMainWindow();
  if (!IS_E2E) {
    registerShortcut(getSettings());
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
  globalShortcut.unregisterAll();
});
