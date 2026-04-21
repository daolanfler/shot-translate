import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  HistoryItem,
  WindowContext
} from "../shared/types";

declare global {
  interface Window {
    shotTranslate: {
      getWindowContext: () => Promise<WindowContext>;
      getSettings: () => Promise<AppSettings>;
      updateSettings: (patch: Partial<AppSettings>) => Promise<{
        settings: AppSettings;
        shortcutRegistered: boolean;
      }>;
      listHistory: () => Promise<HistoryItem[]>;
      getHistoryItem: (id: string) => Promise<HistoryItem | null>;
      clearHistory: () => Promise<HistoryItem[]>;
      retryHistoryItem: (id: string) => Promise<HistoryItem | null>;
      startCapture: () => Promise<void>;
      getCaptureSource: (displayId: number) => Promise<CaptureSourcePayload>;
      submitCapture: (payload: CaptureSubmitPayload) => Promise<boolean>;
      cancelCapture: () => Promise<boolean>;
      writeClipboardText: (text: string) => Promise<boolean>;
      closeResultWindow: () => Promise<boolean>;
      onAppEvent: (listener: (event: AppEvent) => void) => () => void;
    };
  }
}

export {};
