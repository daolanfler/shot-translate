import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../shared/types";
import type { ShortcutRegistrar } from "./shortcut";
import { createSettingsUpdateManager } from "./settingsUpdateManager";

const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn()
}));

vi.mock("./settings", () => ({
  getSettings,
  updateSettings
}));

const baseSettings: AppSettings = {
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

function createShortcutRegistrar(overrides: Partial<ShortcutRegistrar> = {}): ShortcutRegistrar {
  return {
    register: vi.fn(() => true),
    replace: vi.fn(() => true),
    unregister: vi.fn(),
    ...overrides
  };
}

describe("createSettingsUpdateManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockReturnValue(baseSettings);
    updateSettings.mockImplementation(async (patch: Partial<AppSettings>) => ({
      ...baseSettings,
      ...patch
    }));
  });

  it("persists non-shortcut settings without touching shortcut registration", async () => {
    const shortcutRegistrar = createShortcutRegistrar();
    const manager = createSettingsUpdateManager({ isE2e: false, shortcutRegistrar });

    const result = await manager.updateSettingsSafely({ model: "gpt-4.1" });

    expect(updateSettings).toHaveBeenCalledWith({ model: "gpt-4.1" });
    expect(shortcutRegistrar.register).not.toHaveBeenCalled();
    expect(shortcutRegistrar.replace).not.toHaveBeenCalled();
    expect(result.shortcutRegistered).toBe(true);
  });

  it("persists unchanged shortcut settings without replacing the registered shortcut", async () => {
    const shortcutRegistrar = createShortcutRegistrar();
    const manager = createSettingsUpdateManager({ isE2e: false, shortcutRegistrar });

    const result = await manager.updateSettingsSafely({ shortcut: " Alt+S " });

    expect(updateSettings).toHaveBeenCalledWith({ shortcut: "Alt+S" });
    expect(shortcutRegistrar.register).not.toHaveBeenCalled();
    expect(shortcutRegistrar.replace).not.toHaveBeenCalled();
    expect(result.shortcutRegistered).toBe(true);
  });

  it("validates shortcut patches before persisting", async () => {
    const shortcutRegistrar = createShortcutRegistrar();
    const manager = createSettingsUpdateManager({ isE2e: false, shortcutRegistrar });

    const result = await manager.updateSettingsSafely({ shortcut: "Alt+Shift" });

    expect(updateSettings).not.toHaveBeenCalled();
    expect(shortcutRegistrar.replace).not.toHaveBeenCalled();
    expect(result.shortcutRegistered).toBe(false);
  });

  it("restores the previous shortcut registration when a new shortcut cannot be registered", async () => {
    const shortcutRegistrar = createShortcutRegistrar({
      replace: vi.fn(() => false)
    });
    const manager = createSettingsUpdateManager({ isE2e: false, shortcutRegistrar });

    const result = await manager.updateSettingsSafely({ shortcut: "Alt+T" });

    expect(shortcutRegistrar.replace).toHaveBeenCalledWith("Alt+T", baseSettings);
    expect(updateSettings).not.toHaveBeenCalled();
    expect(result.shortcutRegistered).toBe(false);
  });
});
