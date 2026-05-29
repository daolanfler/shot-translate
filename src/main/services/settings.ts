import { app, safeStorage } from "electron";
import type { AppSettings, OcrLanguageProfile, OcrPreprocessingSettings } from "../../shared/types";
import { readJsonFile, writeJsonFile } from "./store";

const SETTINGS_FILE = "settings.json";
const ENCRYPTED_PREFIX = "enc:v1:";

export const defaultSettings: AppSettings = {
  // Alt+S avoids the common Ctrl+Shift+T browser "reopen closed tab" conflict.
  shortcut: "Alt+S",
  targetLanguage: "zh-CN",
  ocrLanguages: ["eng", "chi_sim"],
  ocrLanguageProfile: "zh-en",
  ocrPreprocessing: {
    enabled: false,
    upscale: 1,
    grayscale: false,
    contrast: 0,
    threshold: {
      enabled: false
    }
  },
  apiProvider: "openai-compatible",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  apiProxyUrl: "",
  model: "gpt-4.1-mini",
  launchOnStartup: false
};

let cachedSettings: AppSettings | null = null;
let settingsWriteQueue: Promise<void> = Promise.resolve();

export function resetSettingsForTests(): void {
  cachedSettings = null;
  settingsWriteQueue = Promise.resolve();
}

function decryptApiKey(stored: string): string {
  if (!stored) {
    return "";
  }

  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    // Legacy plaintext from before safeStorage migration. Return as-is; the
    // caller will re-encrypt on the next write.
    return stored;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("safeStorage unavailable; cannot decrypt apiKey.");
    return "";
  }

  try {
    const buf = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), "base64");
    return safeStorage.decryptString(buf);
  } catch (error) {
    console.warn("Failed to decrypt apiKey; resetting to empty.", error);
    return "";
  }
}

function encryptApiKeyForStorage(plaintext: string): string {
  if (!plaintext) {
    return "";
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("safeStorage unavailable; storing apiKey in plaintext.");
    return plaintext;
  }

  const buf = safeStorage.encryptString(plaintext);
  return ENCRYPTED_PREFIX + buf.toString("base64");
}

const ocrLanguageProfiles: Record<Exclude<OcrLanguageProfile, "manual">, string[]> = {
  "zh-en": ["eng", "chi_sim"],
  english: ["eng"],
  cjk: ["eng", "chi_sim", "chi_tra", "jpn", "kor"]
};

function normalizeOcrLanguages(languages: string[] | undefined): string[] {
  const trimmed = (languages ?? defaultSettings.ocrLanguages).map((language) => language.trim()).filter(Boolean);
  return trimmed.length > 0 ? Array.from(new Set(trimmed)).sort() : ["eng"];
}

function inferOcrLanguageProfile(languages: string[]): OcrLanguageProfile {
  const key = languages.join("+");
  const match = Object.entries(ocrLanguageProfiles).find(([, profileLanguages]) => {
    return normalizeOcrLanguages(profileLanguages).join("+") === key;
  });

  return (match?.[0] as OcrLanguageProfile | undefined) ?? "manual";
}

function normalizeOcrPreprocessing(raw: Partial<OcrPreprocessingSettings> | undefined): OcrPreprocessingSettings {
  return {
    ...defaultSettings.ocrPreprocessing,
    ...raw,
    threshold: {
      ...defaultSettings.ocrPreprocessing.threshold,
      ...raw?.threshold
    }
  };
}

function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  const ocrLanguages = normalizeOcrLanguages(raw.ocrLanguages);
  const ocrLanguageProfile = raw.ocrLanguageProfile ?? inferOcrLanguageProfile(ocrLanguages);

  return {
    ...defaultSettings,
    ...raw,
    ocrLanguages,
    ocrLanguageProfile,
    ocrPreprocessing: normalizeOcrPreprocessing(raw.ocrPreprocessing)
  };
}

async function persistSettings(plaintext: AppSettings): Promise<void> {
  await writeJsonFile(SETTINGS_FILE, {
    ...plaintext,
    apiKey: encryptApiKeyForStorage(plaintext.apiKey)
  });
}

function enqueueSettingsWrite<T>(operation: () => Promise<T>): Promise<T> {
  const queued = settingsWriteQueue.then(operation, operation);
  settingsWriteQueue = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

export function getSettings(): AppSettings {
  if (cachedSettings) {
    return cachedSettings;
  }

  const raw = readJsonFile<Partial<AppSettings>>(SETTINGS_FILE, {});
  const storedApiKey = raw.apiKey ?? "";
  const isLegacyPlaintext = storedApiKey.length > 0 && !storedApiKey.startsWith(ENCRYPTED_PREFIX);

  cachedSettings = {
    ...normalizeSettings(raw),
    apiKey: decryptApiKey(storedApiKey)
  };

  // One-time migration: re-write with encryption so legacy plaintext stops
  // sitting on disk. Fire and forget — cached settings are already correct in
  // memory, and a failed write just means we re-migrate next launch.
  if (isLegacyPlaintext) {
    void enqueueSettingsWrite(async () => {
      if (cachedSettings) {
        await persistSettings(cachedSettings);
      }
    }).catch((error) => {
      console.error("Failed to migrate legacy plaintext apiKey.", error);
    });
  }

  return cachedSettings;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return enqueueSettingsWrite(async () => {
    const nextSettings = normalizeSettings({
      ...getSettings(),
      ...patch
    });

    await persistSettings(nextSettings);
    cachedSettings = nextSettings;

    if (process.env.SHOT_TRANSLATE_E2E !== "1") {
      app.setLoginItemSettings({
        openAtLogin: cachedSettings.launchOnStartup
      });
    }

    return cachedSettings;
  });
}
