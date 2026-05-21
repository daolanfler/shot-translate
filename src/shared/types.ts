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
  /**
   * Tesseract language packs to load (e.g. "eng", "chi_sim"). Order does not
   * matter; the OCR worker keys itself by the sorted list so toggling languages
   * triggers a clean rebuild.
   */
  ocrLanguages: string[];
  apiProvider: ApiProvider;
  apiBaseUrl: string;
  apiKey: string;
  apiProxyUrl: string;
  model: string;
  launchOnStartup: boolean;
}

export type ServiceErrorCode =
  | "missing_api_key"
  | "invalid_base_url"
  | "proxy_failed"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "model_not_found"
  | "timeout"
  | "network_error"
  | "bad_response"
  | "unknown";

export interface ServiceResult {
  ok: boolean;
  message: string;
  code?: ServiceErrorCode;
  details?: string;
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

/** Rectangle in screen / display coordinates (CSS pixels, not device pixels). */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureSubmitPayload {
  displayId: number;
  imageDataUrl: string;
  /**
   * The captured region in screen-coordinates (CSS px). Used to anchor the
   * result window near the selection instead of always centering on the
   * primary display.
   */
  selectionRect: ScreenRect;
}

export interface AppEvent {
  type: "history-updated" | "settings-updated" | "workflow-status";
  payload?: {
    busy?: boolean;
    message?: string;
  };
}
