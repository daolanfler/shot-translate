import { globalShortcut } from "electron";
import type { AppSettings } from "../../shared/types";

const modifierOnlyKeys = new Set(["Alt", "Shift", "Control", "CommandOrControl", "CmdOrCtrl", "Command", "Super"]);

export interface ShortcutRegistrar {
  register: (settings: AppSettings) => boolean;
  replace: (shortcut: string, fallbackSettings: AppSettings) => boolean;
  unregister: () => void;
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
  let registeredShortcut: string | null = null;

  function register(settings: AppSettings): boolean {
    return replaceOwnedShortcut(settings.shortcut, settings.shortcut);
  }

  function registerAccelerator(shortcut: string): boolean {
    const registered = globalShortcut.register(shortcut, options.onCapture);
    if (registered) {
      registeredShortcut = shortcut;
    }
    return registered;
  }

  function unregister(): void {
    if (registeredShortcut === null) {
      return;
    }

    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
  }

  function replaceOwnedShortcut(shortcut: string, fallbackShortcut: string): boolean {
    if (registeredShortcut === shortcut) {
      return true;
    }

    unregister();
    const registered = registerAccelerator(shortcut);
    if (registered) {
      return true;
    }

    if (fallbackShortcut !== shortcut) {
      registerAccelerator(fallbackShortcut);
    }
    return false;
  }

  function replace(shortcut: string, fallbackSettings: AppSettings): boolean {
    return replaceOwnedShortcut(shortcut, fallbackSettings.shortcut);
  }

  return {
    register,
    replace,
    unregister
  };
}
