import { app, safeStorage } from "electron";
import type { AppSettings } from "../../shared/types";
import { readJsonFile, writeJsonFile } from "./store";

const SETTINGS_FILE = "settings.json";
const ENCRYPTED_PREFIX = "enc:v1:";

export const defaultSettings: AppSettings = {
  shortcut: "CommandOrControl+Shift+T",
  targetLanguage: "zh-CN",
  apiProvider: "openai-compatible",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  apiProxyUrl: "",
  model: "gpt-4.1-mini",
  launchOnStartup: false
};

let cachedSettings: AppSettings | null = null;

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

function persistSettings(plaintext: AppSettings) {
  writeJsonFile(SETTINGS_FILE, {
    ...plaintext,
    apiKey: encryptApiKeyForStorage(plaintext.apiKey)
  });
}

export function getSettings(): AppSettings {
  if (cachedSettings) {
    return cachedSettings;
  }

  const raw = readJsonFile<Partial<AppSettings>>(SETTINGS_FILE, {});
  const storedApiKey = raw.apiKey ?? "";
  const isLegacyPlaintext = storedApiKey.length > 0 && !storedApiKey.startsWith(ENCRYPTED_PREFIX);

  cachedSettings = {
    ...defaultSettings,
    ...raw,
    apiKey: decryptApiKey(storedApiKey)
  };

  // One-time migration: re-write with encryption so legacy plaintext stops
  // sitting on disk after the first read.
  if (isLegacyPlaintext) {
    persistSettings(cachedSettings);
  }

  return cachedSettings;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  cachedSettings = {
    ...getSettings(),
    ...patch
  };

  app.setLoginItemSettings({
    openAtLogin: cachedSettings.launchOnStartup
  });

  persistSettings(cachedSettings);
  return cachedSettings;
}
