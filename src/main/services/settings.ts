import { app } from "electron";
import type { AppSettings } from "../../shared/types";
import { readJsonFile, writeJsonFile } from "./store";

const SETTINGS_FILE = "settings.json";

export const defaultSettings: AppSettings = {
  shortcut: "CommandOrControl+Shift+T",
  targetLanguage: "zh-CN",
  apiProvider: "openai-compatible",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  launchOnStartup: false
};

let cachedSettings: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (!cachedSettings) {
    cachedSettings = {
      ...defaultSettings,
      ...readJsonFile<AppSettings>(SETTINGS_FILE, defaultSettings)
    };
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

  writeJsonFile(SETTINGS_FILE, cachedSettings);
  return cachedSettings;
}

