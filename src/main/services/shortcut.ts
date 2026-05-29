import { globalShortcut } from "electron";
import type { AppSettings } from "../../shared/types";

const modifierOnlyKeys = new Set(["Alt", "Shift", "Control", "CommandOrControl", "CmdOrCtrl", "Command", "Super"]);

export interface ShortcutRegistrar {
  register: (settings: AppSettings) => boolean;
  registerAccelerator: (shortcut: string) => boolean;
  unregisterAll: () => void;
}

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

export function createShortcutRegistrar(options: { onCapture: () => void }): ShortcutRegistrar {
  function register(settings: AppSettings): boolean {
    globalShortcut.unregisterAll();
    return registerAccelerator(settings.shortcut);
  }

  function registerAccelerator(shortcut: string): boolean {
    return globalShortcut.register(shortcut, options.onCapture);
  }

  return {
    register,
    registerAccelerator,
    unregisterAll: () => {
      globalShortcut.unregisterAll();
    }
  };
}
