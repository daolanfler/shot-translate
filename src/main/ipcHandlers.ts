import { BrowserWindow, clipboard, ipcMain } from "electron";
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
  deleteHistoryItem,
  getHistoryItem,
  listHistory
} from "./services/history";
import { getSettings } from "./services/settings";
import { log } from "./services/logger";
import { testTranslationConnection } from "./services/translator";
import type { E2eHarness } from "./testing/e2eHarness";
import type { UpdateService } from "./services/updateService";
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

type WorkflowState = "idle" | "capturing" | "processing";

export interface IpcHandlerDeps {
  e2eHarness: E2eHarness | null;
  broadcast: (event: AppEvent) => void;
  getContextForSender: (senderId: number) => WindowContext;
  getResultWindow: () => BrowserWindow | null;
  requireUpdateService: () => UpdateService;
  updateSettingsSafely: (patch: Partial<AppSettings>) => Promise<{
    settings: AppSettings;
    shortcutRegistered: boolean;
    message: string;
  }>;
  getCaptureSource: (displayId: number) => Promise<CaptureSourcePayload>;
  startCaptureFlow: () => Promise<void>;
  cropCaptureSelection: (payload: CaptureSubmitPayload) => Promise<string>;
  closeCaptureWindows: () => void;
  moveResultWindow: (payload: ResultWindowMovePayload) => boolean;
  retryHistoryItem: (id: string, sourceText?: string) => Promise<HistoryItem | null>;
  setQuitting: () => void;
  getWorkflowState: () => WorkflowState;
  setWorkflowState: (next: WorkflowState, message?: string) => void;
  closeResultWindow: () => void;
  processCaptureResult: (imageDataUrl: string, selectionRect?: ScreenRect) => Promise<void>;
}

export function installIpcHandlers(deps: IpcHandlerDeps): void {
  ipcMain.handle("window:getContext", (event) => {
    return deps.getContextForSender(event.sender.id);
  });

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:update", async (_event, patch: unknown) => {
    const result = await deps.updateSettingsSafely(validateSettingsPatch(patch));

    deps.broadcast({
      type: "settings-updated",
      payload: {
        message: result.message
      }
    });

    return result;
  });
  ipcMain.handle("settings:testApiConnection", async (_event, patch: unknown): Promise<ServiceResult> => {
    const validatedPatch = validateSettingsPatch(patch);
    if (deps.e2eHarness) {
      return deps.e2eHarness.testApiConnection(validatedPatch);
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
    deps.broadcast({ type: "history-updated" });
    return listHistory();
  });
  ipcMain.handle("history:delete", async (_event, id: unknown) => {
    await deleteHistoryItem(validateHistoryId(id));
    deps.broadcast({ type: "history-updated" });
    return listHistory();
  });
  ipcMain.handle("history:retry", (_event, id: unknown, sourceText?: unknown) =>
    deps.retryHistoryItem(validateHistoryId(id), validateRetrySourceText(sourceText))
  );

  ipcMain.handle("updates:get-state", () => {
    return deps.requireUpdateService().getState();
  });

  ipcMain.handle("updates:get-settings", () => {
    return deps.requireUpdateService().getSettings();
  });

  ipcMain.handle("updates:set-source", (_event, source: unknown) => {
    return deps.requireUpdateService().setSource(validateUpdateSource(source));
  });

  ipcMain.handle("updates:check", () => {
    return deps.requireUpdateService().checkForUpdates();
  });

  ipcMain.handle("updates:download", () => {
    return deps.requireUpdateService().downloadUpdate();
  });

  ipcMain.handle("updates:install", () => {
    deps.setQuitting();
    deps.requireUpdateService().installUpdate();
  });

  ipcMain.handle("capture:start", () => deps.startCaptureFlow());
  ipcMain.handle("capture:source", (_event, displayId: unknown) => {
    if (typeof displayId !== "number" || !Number.isInteger(displayId)) {
      throw new Error("displayId must be an integer.");
    }

    return deps.getCaptureSource(displayId);
  });
  ipcMain.handle("capture:submit", async (event, payload: unknown) => {
    const validatedPayload = validateCaptureSubmitPayload(payload);
    const context = deps.getContextForSender(event.sender.id);
    if (context.type !== "capture" || context.displayId !== validatedPayload.displayId) {
      throw new Error("Capture submission did not come from the selected display.");
    }

    const imageDataUrl = await deps.cropCaptureSelection(validatedPayload);
    deps.setWorkflowState("processing", "Running OCR");
    deps.closeCaptureWindows();
    await deps.processCaptureResult(imageDataUrl, validatedPayload.selectionRect);
    return true;
  });
  ipcMain.handle("capture:cancel", () => {
    deps.closeCaptureWindows();
    return true;
  });

  ipcMain.handle("clipboard:writeText", (_event, text: unknown) => {
    clipboard.writeText(validateClipboardText(text));
    return true;
  });
  ipcMain.handle("result:move", (event, payload: unknown) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow !== deps.getResultWindow() || deps.getContextForSender(event.sender.id).type !== "result") {
      return false;
    }

    return deps.moveResultWindow(validateResultWindowMovePayload(payload));
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

  deps.e2eHarness?.installIpcHandlers({
    getWorkflowState: deps.getWorkflowState,
    setWorkflowState: deps.setWorkflowState,
    closeCaptureWindows: deps.closeCaptureWindows,
    closeResultWindow: deps.closeResultWindow,
    processCaptureResult: deps.processCaptureResult
  });
}
