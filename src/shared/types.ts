export type ApiProvider = "openai-compatible";

export type HistoryStatus =
  | "pending"
  | "ocr_processing"
  | "ocr_failed"
  | "translating"
  | "success"
  | "error";

export interface AppSettings {
  shortcut: string;
  targetLanguage: string;
  apiProvider: ApiProvider;
  apiBaseUrl: string;
  apiKey: string;
  apiProxyUrl: string;
  model: string;
  launchOnStartup: boolean;
}

export interface HistoryItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: HistoryStatus;
  errorMessage?: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  elapsedMs: number;
}

export interface CaptureContext {
  type: "capture";
  displayId: number;
}

export interface ResultContext {
  type: "result";
  historyId: string;
}

export interface MainContext {
  type: "main";
}

export type WindowContext = CaptureContext | ResultContext | MainContext;

export interface CaptureSourcePayload {
  displayId: number;
  displayLabel: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface CaptureSubmitPayload {
  displayId: number;
  imageDataUrl: string;
}

export interface AppEvent {
  type: "history-updated" | "settings-updated" | "workflow-status";
  payload?: {
    busy?: boolean;
    message?: string;
  };
}
