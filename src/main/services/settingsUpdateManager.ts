import type { AppSettings } from "../../shared/types";
import { getSettings, updateSettings } from "./settings";
import { isLikelyAccelerator, type ShortcutRegistrar } from "./shortcut";

export interface SettingsUpdateResult {
  settings: AppSettings;
  shortcutRegistered: boolean;
  message: string;
}

export function createSettingsUpdateManager(options: {
  isE2e: boolean;
  shortcutRegistrar: ShortcutRegistrar;
}): {
  updateSettingsSafely: (patch: Partial<AppSettings>) => Promise<SettingsUpdateResult>;
} {
  async function updateSettingsSafely(patch: Partial<AppSettings>): Promise<SettingsUpdateResult> {
    const current = getSettings();

    if (typeof patch.shortcut === "string" && patch.shortcut !== current.shortcut) {
      const shortcut = patch.shortcut.trim();

      if (!isLikelyAccelerator(shortcut)) {
        return {
          settings: current,
          shortcutRegistered: false,
          message: "Shortcut is invalid. Use a key plus optional modifiers, for example Alt+S."
        };
      }

      options.shortcutRegistrar.unregisterAll();
      const registered = options.shortcutRegistrar.registerAccelerator(shortcut);

      if (!registered) {
        options.shortcutRegistrar.register(current);
        return {
          settings: current,
          shortcutRegistered: false,
          message: "Shortcut could not be registered. It may already be in use."
        };
      }

      const settings = await updateSettings({
        ...patch,
        shortcut
      });
      return {
        settings,
        shortcutRegistered: true,
        message: "Settings saved."
      };
    }

    const settings = await updateSettings(patch);
    if (!options.isE2e) {
      options.shortcutRegistrar.register(settings);
    }
    return {
      settings,
      shortcutRegistered: true,
      message: "Settings saved."
    };
  }

  return {
    updateSettingsSafely
  };
}
