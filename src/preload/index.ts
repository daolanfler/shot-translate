import { contextBridge, ipcRenderer } from "electron";
import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  HistoryItem,
  ServiceResult,
  WindowContext
} from "../shared/types";

const api = {
  getWindowContext: () => ipcRenderer.invoke("window:getContext") as Promise<WindowContext>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:update", patch) as Promise<{
      settings: AppSettings;
      shortcutRegistered: boolean;
      message: string;
    }>,
  testApiConnection: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:testApiConnection", patch) as Promise<ServiceResult>,
  listHistory: () => ipcRenderer.invoke("history:list") as Promise<HistoryItem[]>,
  getHistoryItem: (id: string) => ipcRenderer.invoke("history:get", id) as Promise<HistoryItem | null>,
  clearHistory: () => ipcRenderer.invoke("history:clear") as Promise<HistoryItem[]>,
  deleteHistoryItem: (id: string) => ipcRenderer.invoke("history:delete", id) as Promise<HistoryItem[]>,
  retryHistoryItem: (id: string, sourceText?: string) =>
    ipcRenderer.invoke("history:retry", id, sourceText) as Promise<HistoryItem | null>,
  startCapture: () => ipcRenderer.invoke("capture:start") as Promise<void>,
  getCaptureSource: (displayId: number) =>
    ipcRenderer.invoke("capture:source", displayId) as Promise<CaptureSourcePayload>,
  submitCapture: (payload: CaptureSubmitPayload) =>
    ipcRenderer.invoke("capture:submit", payload) as Promise<boolean>,
  cancelCapture: () => ipcRenderer.invoke("capture:cancel") as Promise<boolean>,
  writeClipboardText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text) as Promise<boolean>,
  closeResultWindow: () => ipcRenderer.invoke("result:close") as Promise<boolean>,
  reportRendererError: (payload: { message: string; stack?: string }) =>
    ipcRenderer.invoke("log:rendererError", payload) as Promise<boolean>,
  onAppEvent: (listener: (event: AppEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: AppEvent) => listener(payload);
    ipcRenderer.on("app:event", wrapped);
    return () => {
      ipcRenderer.removeListener("app:event", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("shotTranslate", api);
