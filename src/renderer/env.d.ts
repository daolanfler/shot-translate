import type {
  AppEvent,
  AppSettings,
  CaptureSourcePayload,
  CaptureSubmitPayload,
  HistoryItem,
  ServiceResult,
  UpdateSettings,
  UpdateSource,
  UpdateState,
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
        message: string;
      }>;
      testApiConnection: (patch: Partial<AppSettings>) => Promise<ServiceResult>;
      listHistory: () => Promise<HistoryItem[]>;
      getHistoryItem: (id: string) => Promise<HistoryItem | null>;
      clearHistory: () => Promise<HistoryItem[]>;
      deleteHistoryItem: (id: string) => Promise<HistoryItem[]>;
      retryHistoryItem: (id: string, sourceText?: string) => Promise<HistoryItem | null>;
      getUpdateState: () => Promise<UpdateState>;
      getUpdateSettings: () => Promise<UpdateSettings>;
      setUpdateSource: (source: UpdateSource) => Promise<UpdateSettings>;
      checkForUpdates: () => Promise<UpdateState>;
      downloadUpdate: () => Promise<UpdateState>;
      installUpdate: () => Promise<void>;
      startCapture: () => Promise<void>;
      getCaptureSource: (displayId: number) => Promise<CaptureSourcePayload>;
      submitCapture: (payload: CaptureSubmitPayload) => Promise<boolean>;
      cancelCapture: () => Promise<boolean>;
      writeClipboardText: (text: string) => Promise<boolean>;
      closeResultWindow: () => Promise<boolean>;
      reportRendererError: (payload: { message: string; stack?: string }) => Promise<boolean>;
      onAppEvent: (listener: (event: AppEvent) => void) => () => void;
      onUpdateStateChanged: (listener: (state: UpdateState) => void) => () => void;
    };
  }
}

export {};
