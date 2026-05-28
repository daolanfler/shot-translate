import type {
  AppSettings,
  CaptureSubmitPayload,
  OcrLanguageProfile,
  OcrPreprocessingSettings,
  ResultWindowMovePayload,
  ScreenRect,
  UpdateSource
} from "../shared/types";

const ocrLanguageProfiles = new Set<OcrLanguageProfile>(["zh-en", "english", "cjk", "manual"]);
const updateSources = new Set<UpdateSource>(["mirror", "github"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePlainObject(value: unknown, name: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`${name} must be an object.`);
  }

  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, name);
}

function validateScreenRect(value: unknown, name: string): ScreenRect {
  const raw = requirePlainObject(value, name);
  const { x, y, width, height } = raw;

  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`${name} must contain finite x, y, width, and height values.`);
  }

  return { x, y, width, height };
}

function validateOcrPreprocessing(value: unknown): OcrPreprocessingSettings {
  const raw = requirePlainObject(value, "ocrPreprocessing");
  const threshold = requirePlainObject(raw.threshold, "ocrPreprocessing.threshold");
  const upscale = raw.upscale;
  const contrast = raw.contrast;
  const thresholdValue = threshold.value;

  if (typeof raw.enabled !== "boolean") {
    throw new Error("ocrPreprocessing.enabled must be a boolean.");
  }

  if (upscale !== 1 && upscale !== 2 && upscale !== 3) {
    throw new Error("ocrPreprocessing.upscale must be 1, 2, or 3.");
  }

  if (typeof raw.grayscale !== "boolean") {
    throw new Error("ocrPreprocessing.grayscale must be a boolean.");
  }

  if (!isFiniteNumber(contrast) || contrast < 0 || contrast > 3) {
    throw new Error("ocrPreprocessing.contrast must be between 0 and 3.");
  }

  if (typeof threshold.enabled !== "boolean") {
    throw new Error("ocrPreprocessing.threshold.enabled must be a boolean.");
  }

  if (thresholdValue !== undefined && (!isFiniteNumber(thresholdValue) || thresholdValue < 0 || thresholdValue > 255)) {
    throw new Error("ocrPreprocessing.threshold.value must be between 0 and 255.");
  }

  return {
    enabled: raw.enabled,
    upscale,
    grayscale: raw.grayscale,
    contrast,
    threshold: {
      enabled: threshold.enabled,
      ...(thresholdValue === undefined ? {} : { value: thresholdValue })
    }
  };
}

export function validateSettingsPatch(value: unknown): Partial<AppSettings> {
  const raw = requirePlainObject(value, "settings patch");
  const patch: Partial<AppSettings> = {};

  for (const key of Object.keys(raw)) {
    if (
      ![
        "shortcut",
        "targetLanguage",
        "ocrLanguages",
        "ocrLanguageProfile",
        "ocrPreprocessing",
        "apiProvider",
        "apiBaseUrl",
        "apiKey",
        "apiProxyUrl",
        "model",
        "launchOnStartup"
      ].includes(key)
    ) {
      throw new Error(`Unsupported settings field: ${key}.`);
    }
  }

  if (raw.shortcut !== undefined) {
    patch.shortcut = requireString(raw.shortcut, "shortcut").trim();
  }
  if (raw.targetLanguage !== undefined) {
    patch.targetLanguage = requireString(raw.targetLanguage, "targetLanguage").trim();
  }
  if (raw.ocrLanguages !== undefined) {
    if (!Array.isArray(raw.ocrLanguages) || raw.ocrLanguages.some((item) => typeof item !== "string")) {
      throw new Error("ocrLanguages must be an array of strings.");
    }
    patch.ocrLanguages = raw.ocrLanguages.map((item) => item.trim()).filter(Boolean);
  }
  if (raw.ocrLanguageProfile !== undefined) {
    if (!ocrLanguageProfiles.has(raw.ocrLanguageProfile as OcrLanguageProfile)) {
      throw new Error("ocrLanguageProfile is invalid.");
    }
    patch.ocrLanguageProfile = raw.ocrLanguageProfile as OcrLanguageProfile;
  }
  if (raw.ocrPreprocessing !== undefined) {
    patch.ocrPreprocessing = validateOcrPreprocessing(raw.ocrPreprocessing);
  }
  if (raw.apiProvider !== undefined) {
    if (raw.apiProvider !== "openai-compatible") {
      throw new Error("apiProvider is invalid.");
    }
    patch.apiProvider = raw.apiProvider;
  }
  if (raw.apiBaseUrl !== undefined) {
    patch.apiBaseUrl = requireString(raw.apiBaseUrl, "apiBaseUrl").trim();
  }
  if (raw.apiKey !== undefined) {
    patch.apiKey = requireString(raw.apiKey, "apiKey");
  }
  if (raw.apiProxyUrl !== undefined) {
    patch.apiProxyUrl = requireString(raw.apiProxyUrl, "apiProxyUrl").trim();
  }
  if (raw.model !== undefined) {
    patch.model = requireString(raw.model, "model").trim();
  }
  if (raw.launchOnStartup !== undefined) {
    if (typeof raw.launchOnStartup !== "boolean") {
      throw new Error("launchOnStartup must be a boolean.");
    }
    patch.launchOnStartup = raw.launchOnStartup;
  }

  return patch;
}

export function validateHistoryId(value: unknown): string {
  const id = requireString(value, "history id").trim();
  if (!id) {
    throw new Error("history id is required.");
  }

  return id;
}

export function validateRetrySourceText(value: unknown): string | undefined {
  return optionalString(value, "sourceText");
}

export function validateCaptureSubmitPayload(value: unknown): CaptureSubmitPayload {
  const raw = requirePlainObject(value, "capture payload");
  const displayId = raw.displayId;
  const imageDataUrl = requireString(raw.imageDataUrl, "imageDataUrl");

  if (typeof displayId !== "number" || !Number.isInteger(displayId)) {
    throw new Error("displayId must be an integer.");
  }

  if (!/^data:image\/(?:png|jpeg|webp);base64,/u.test(imageDataUrl)) {
    throw new Error("imageDataUrl must be a PNG, JPEG, or WebP data URL.");
  }

  return {
    displayId,
    imageDataUrl,
    selectionRect: validateScreenRect(raw.selectionRect, "selectionRect")
  };
}

export function validateResultWindowMovePayload(value: unknown): ResultWindowMovePayload {
  const raw = requirePlainObject(value, "result window movement");
  if (!isFiniteNumber(raw.deltaX) || !isFiniteNumber(raw.deltaY)) {
    throw new Error("result window movement must contain finite deltaX and deltaY values.");
  }

  return {
    deltaX: raw.deltaX,
    deltaY: raw.deltaY
  };
}

export function validateUpdateSource(value: unknown): UpdateSource {
  if (!updateSources.has(value as UpdateSource)) {
    throw new Error("Update source is invalid.");
  }

  return value as UpdateSource;
}

export function validateClipboardText(value: unknown): string {
  return requireString(value, "clipboard text");
}

export function validateRendererError(value: unknown): { message: string; stack?: string } {
  const raw = requirePlainObject(value, "renderer error");
  const message = requireString(raw.message, "renderer error message").trim();

  if (!message) {
    throw new Error("renderer error message is required.");
  }

  return {
    message,
    stack: optionalString(raw.stack, "renderer error stack")
  };
}
