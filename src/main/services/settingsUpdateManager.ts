import type { AppSettings } from "../../shared/types";
import { getSettings, updateSettings } from "./settings";
import { isLikelyAccelerator, type ShortcutRegistrar } from "./shortcut";

export interface SettingsUpdateResult {
  settings: AppSettings;
  shortcutRegistered: boolean;
  message: string;
}

const SETTINGS_SAVED_MESSAGE = "Settings saved.";
const INVALID_SHORTCUT_MESSAGE = "Shortcut is invalid. Use a key plus optional modifiers, for example Alt+S.";
const SHORTCUT_REGISTRATION_FAILED_MESSAGE = "Shortcut could not be registered. It may already be in use.";

function createSuccessResult(settings: AppSettings): SettingsUpdateResult {
  return {
    settings,
    shortcutRegistered: true,
    message: SETTINGS_SAVED_MESSAGE
  };
}

function createShortcutFailureResult(settings: AppSettings, message: string): SettingsUpdateResult {
  return {
    settings,
    shortcutRegistered: false,
    message
  };
}

export function createSettingsUpdateManager(options: {
  isE2e: boolean;
  shortcutRegistrar: ShortcutRegistrar;
}): {
  updateSettingsSafely: (patch: Partial<AppSettings>) => Promise<SettingsUpdateResult>;
} {
  async function saveSettings(patch: Partial<AppSettings>): Promise<SettingsUpdateResult> {
    const settings = await updateSettings(patch);
    return createSuccessResult(settings);
  }

  async function updateSettingsSafely(patch: Partial<AppSettings>): Promise<SettingsUpdateResult> {
    const current = getSettings();

    if (typeof patch.shortcut !== "string") {
      return saveSettings(patch);
    }

    const shortcut = patch.shortcut.trim();
    const normalizedPatch = {
      ...patch,
      shortcut
    };

    if (shortcut === current.shortcut) {
      return saveSettings(normalizedPatch);
    }

    if (!isLikelyAccelerator(shortcut)) {
      return createShortcutFailureResult(current, INVALID_SHORTCUT_MESSAGE);
    }

    const registered = options.shortcutRegistrar.replace(shortcut, current);
    if (!registered) {
      return createShortcutFailureResult(current, SHORTCUT_REGISTRATION_FAILED_MESSAGE);
    }

    return saveSettings(normalizedPatch);
  }

  return {
    updateSettingsSafely
  };
}
