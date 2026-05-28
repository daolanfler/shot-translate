import { globalShortcut } from "electron";
import type { AppSettings } from "../../shared/types";
import { getSettings, updateSettings } from "./settings";

const modifierOnlyKeys = new Set(["Alt", "Shift", "Control", "CommandOrControl", "CmdOrCtrl", "Command", "Super"]);

export function isLikelyAccelerator(value: string): boolean {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    return false;
  }

  const key = parts.at(-1);
  return Boolean(key && !modifierOnlyKeys.has(key));
}

export function createShortcutManager(options: { isE2e: boolean; onCapture: () => void }) {
  function registerShortcut(settings: AppSettings): boolean {
    globalShortcut.unregisterAll();
    return globalShortcut.register(settings.shortcut, options.onCapture);
  }

  async function updateSettingsSafely(patch: Partial<AppSettings>): Promise<{
    settings: AppSettings;
    shortcutRegistered: boolean;
    message: string;
  }> {
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

      globalShortcut.unregisterAll();
      const registered = globalShortcut.register(shortcut, options.onCapture);

      if (!registered) {
        registerShortcut(current);
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
      registerShortcut(settings);
    }
    return {
      settings,
      shortcutRegistered: true,
      message: "Settings saved."
    };
  }

  return {
    registerShortcut,
    updateSettingsSafely,
    unregisterAll: () => {
      globalShortcut.unregisterAll();
    }
  };
}
