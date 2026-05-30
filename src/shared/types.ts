import { z } from "zod";

const trimmedStringSchema = z.string().transform((value) => value.trim());

export const apiProviderSchema = z.literal("openai-compatible");
export type ApiProvider = z.infer<typeof apiProviderSchema>;

export const ocrLanguageProfileSchema = z.enum(["zh-en", "english", "cjk", "manual"]);
export type OcrLanguageProfile = z.infer<typeof ocrLanguageProfileSchema>;

export const updateSourceSchema = z.enum(["mirror", "github"]);
export type UpdateSource = z.infer<typeof updateSourceSchema>;

const ocrThresholdSettingsSchema = z.object({
  enabled: z.boolean(),
  value: z.number().finite().min(0).max(255).optional()
});

const ocrPreprocessingSettingsShape = {
  enabled: z.boolean(),
  upscale: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  grayscale: z.boolean(),
  contrast: z.number().finite().min(0).max(3),
  threshold: ocrThresholdSettingsSchema
};

export const ocrPreprocessingSettingsSchema = z.object(ocrPreprocessingSettingsShape);
const storedOcrPreprocessingSettingsSchema = z
  .object({
    ...ocrPreprocessingSettingsShape,
    threshold: ocrThresholdSettingsSchema.partial().optional()
  })
  .partial();
export type OcrPreprocessingSettings = z.infer<typeof ocrPreprocessingSettingsSchema>;

const appSettingsShape = {
  shortcut: trimmedStringSchema,
  targetLanguage: trimmedStringSchema,
  /**
   * Tesseract language packs to load (e.g. "eng", "chi_sim"). Order does not
   * matter; the OCR worker keys itself by the sorted list so toggling languages
   * triggers a clean rebuild.
   */
  ocrLanguages: z.array(z.string()).transform((items) => items.map((item) => item.trim()).filter(Boolean)),
  ocrLanguageProfile: ocrLanguageProfileSchema,
  ocrPreprocessing: ocrPreprocessingSettingsSchema,
  apiProvider: apiProviderSchema,
  apiBaseUrl: trimmedStringSchema,
  apiKey: z.string(),
  apiProxyUrl: trimmedStringSchema,
  model: trimmedStringSchema,
  launchOnStartup: z.boolean()
};

export const appSettingsSchema = z.object(appSettingsShape).strict();
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const settingsPatchSchema = appSettingsSchema.partial().strict();
export const storedSettingsSchema = z
  .object({
    ...appSettingsShape,
    ocrPreprocessing: storedOcrPreprocessingSettingsSchema
  })
  .partial();
export type StoredSettings = z.infer<typeof storedSettingsSchema>;

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"
  | "disabled";

export interface UpdateSettings {
  source: UpdateSource;
  feedUrl: string;
}

export interface UpdateState {
  status: UpdateStatus;
  source: UpdateSource;
  currentVersion: string;
  availableVersion: string | null;
  downloadProgress: number | null;
  errorMessage: string | null;
  isChecking: boolean;
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  isUpdateDownloaded: boolean;
}

export type HistoryStatus =
  | "pending"
  | "ocr_processing"
  | "ocr_failed"
  | "translating"
  | "low_confidence"
  | "success"
  | "error";

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
  ocrConfidence?: number;
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

export interface ResultWindowMovePayload {
  deltaX: number;
  deltaY: number;
}

export interface CaptureSubmitPayload {
  displayId: number;
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

export interface E2eMockCaptureOptions {
  ocrText?: string;
  ocrConfidence?: number;
  translatedText?: string;
  translationError?: string;
}

export interface E2eState {
  workflowState: "idle" | "capturing" | "processing";
  windowCount: number;
  historyCount: number;
  settings: AppSettings;
  history: HistoryItem[];
}

export interface ShotTranslateApi {
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
  moveResultWindow: (payload: ResultWindowMovePayload) => Promise<boolean>;
  closeResultWindow: () => Promise<boolean>;
  reportRendererError: (payload: { message: string; stack?: string }) => Promise<boolean>;
  onAppEvent: (listener: (event: AppEvent) => void) => () => void;
  onUpdateStateChanged: (listener: (state: UpdateState) => void) => () => void;
  e2e?: {
    getState: () => Promise<E2eState>;
    resetState: () => Promise<boolean>;
    mockCaptureSubmit: (options?: E2eMockCaptureOptions) => Promise<HistoryItem | null>;
  };
}
