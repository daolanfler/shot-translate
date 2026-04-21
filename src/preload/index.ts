import { contextBridge, desktopCapturer, ipcRenderer, screen } from "electron";
import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  HistoryItem,
  WindowContext
} from "../shared/types";

const api = {
  getWindowContext: () => ipcRenderer.invoke("window:getContext") as Promise<WindowContext>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:update", patch) as Promise<{
      settings: AppSettings;
      shortcutRegistered: boolean;
    }>,
  listHistory: () => ipcRenderer.invoke("history:list") as Promise<HistoryItem[]>,
  getHistoryItem: (id: string) => ipcRenderer.invoke("history:get", id) as Promise<HistoryItem | null>,
  clearHistory: () => ipcRenderer.invoke("history:clear") as Promise<HistoryItem[]>,
  retryHistoryItem: (id: string) => ipcRenderer.invoke("history:retry", id) as Promise<HistoryItem | null>,
  startCapture: () => ipcRenderer.invoke("capture:start") as Promise<void>,
  getCaptureSource: async (displayId: number): Promise<CaptureSourcePayload> => {
    const display = screen.getAllDisplays().find((item) => item.id === displayId);

    if (!display) {
      return ipcRenderer.invoke("capture:source", displayId) as Promise<CaptureSourcePayload>;
    }

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.floor(display.bounds.width * display.scaleFactor),
        height: Math.floor(display.bounds.height * display.scaleFactor)
      }
    });
    const source = sources.find((item) => item.display_id === String(displayId));

    if (!source) {
      return ipcRenderer.invoke("capture:source", displayId) as Promise<CaptureSourcePayload>;
    }

    return {
      displayId,
      displayLabel: display.label || `Display ${displayId}`,
      dataUrl: source.thumbnail.toDataURL(),
      width: source.thumbnail.getSize().width,
      height: source.thumbnail.getSize().height
    };
  },
  submitCapture: (payload: CaptureSubmitPayload) =>
    ipcRenderer.invoke("capture:submit", payload) as Promise<boolean>,
  cancelCapture: () => ipcRenderer.invoke("capture:cancel") as Promise<boolean>,
  writeClipboardText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text) as Promise<boolean>,
  closeResultWindow: () => ipcRenderer.invoke("result:close") as Promise<boolean>,
  onAppEvent: (listener: (event: AppEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: AppEvent) => listener(payload);
    ipcRenderer.on("app:event", wrapped);
    return () => {
      ipcRenderer.removeListener("app:event", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("shotTranslate", api);
