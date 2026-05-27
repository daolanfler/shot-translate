import { contextBridge, ipcRenderer } from "electron";
import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  E2eMockCaptureOptions,
  E2eState,
  HistoryItem,
  ServiceResult,
  UpdateSettings,
  UpdateSource,
  UpdateState,
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
  getUpdateState: () => ipcRenderer.invoke("updates:get-state") as Promise<UpdateState>,
  getUpdateSettings: () => ipcRenderer.invoke("updates:get-settings") as Promise<UpdateSettings>,
  setUpdateSource: (source: UpdateSource) =>
    ipcRenderer.invoke("updates:set-source", source) as Promise<UpdateSettings>,
  checkForUpdates: () => ipcRenderer.invoke("updates:check") as Promise<UpdateState>,
  downloadUpdate: () => ipcRenderer.invoke("updates:download") as Promise<UpdateState>,
  installUpdate: () => ipcRenderer.invoke("updates:install") as Promise<void>,
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
  },
  onUpdateStateChanged: (listener: (state: UpdateState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: UpdateState) => listener(payload);
    ipcRenderer.on("updates:state-changed", wrapped);
    return () => {
      ipcRenderer.removeListener("updates:state-changed", wrapped);
    };
  }
};

if (process.env.SHOT_TRANSLATE_E2E === "1") {
  Object.assign(api, {
    e2e: {
      getState: () => ipcRenderer.invoke("e2e:getState") as Promise<E2eState>,
      resetState: () => ipcRenderer.invoke("e2e:resetState") as Promise<boolean>,
      mockCaptureSubmit: (options?: E2eMockCaptureOptions) =>
        ipcRenderer.invoke("e2e:mockCaptureSubmit", options) as Promise<HistoryItem | null>
    }
  });
}

contextBridge.exposeInMainWorld("shotTranslate", api);
