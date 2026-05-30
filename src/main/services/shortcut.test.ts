import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../shared/types";
import { createShortcutRegistrar, isLikelyAccelerator } from "./shortcut";

const { register, unregister, unregisterAll } = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  unregisterAll: vi.fn()
}));

vi.mock("electron", () => ({
  globalShortcut: {
    register,
    unregister,
    unregisterAll
  }
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

describe("isLikelyAccelerator", () => {
  it("accepts accelerators with a final non-modifier key", () => {
    expect(isLikelyAccelerator("Alt+S")).toBe(true);
    expect(isLikelyAccelerator("CommandOrControl+Shift+1")).toBe(true);
  });

  it("rejects empty and modifier-only accelerators", () => {
    expect(isLikelyAccelerator("")).toBe(false);
    expect(isLikelyAccelerator("Alt+Shift")).toBe(false);
  });
});

describe("createShortcutRegistrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    register.mockReturnValue(true);
  });

  it("registers the capture shortcut without clearing unrelated global shortcuts", () => {
    const registrar = createShortcutRegistrar({ onCapture: vi.fn() });

    const registered = registrar.register(baseSettings);

    expect(registered).toBe(true);
    expect(register).toHaveBeenCalledWith("Alt+S", expect.any(Function));
    expect(unregister).not.toHaveBeenCalled();
    expect(unregisterAll).not.toHaveBeenCalled();
  });

  it("replaces the owned capture shortcut without clearing unrelated global shortcuts", () => {
    const registrar = createShortcutRegistrar({ onCapture: vi.fn() });
    registrar.register(baseSettings);

    const replaced = registrar.replace("Alt+T", baseSettings);

    expect(replaced).toBe(true);
    expect(unregister).toHaveBeenCalledWith("Alt+S");
    expect(register).toHaveBeenNthCalledWith(1, "Alt+S", expect.any(Function));
    expect(register).toHaveBeenNthCalledWith(2, "Alt+T", expect.any(Function));
    expect(unregisterAll).not.toHaveBeenCalled();
  });

  it("restores the fallback shortcut when replacement registration fails", () => {
    register.mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(true);
    const registrar = createShortcutRegistrar({ onCapture: vi.fn() });
    registrar.register(baseSettings);

    const replaced = registrar.replace("Alt+T", baseSettings);

    expect(replaced).toBe(false);
    expect(unregister).toHaveBeenCalledWith("Alt+S");
    expect(register).toHaveBeenNthCalledWith(1, "Alt+S", expect.any(Function));
    expect(register).toHaveBeenNthCalledWith(2, "Alt+T", expect.any(Function));
    expect(register).toHaveBeenNthCalledWith(3, "Alt+S", expect.any(Function));
    expect(unregisterAll).not.toHaveBeenCalled();
  });

  it("keeps the current shortcut when replacement uses the same accelerator", () => {
    const registrar = createShortcutRegistrar({ onCapture: vi.fn() });
    registrar.register(baseSettings);
    vi.clearAllMocks();

    const replaced = registrar.replace("Alt+S", baseSettings);

    expect(replaced).toBe(true);
    expect(register).not.toHaveBeenCalled();
    expect(unregister).not.toHaveBeenCalled();
    expect(unregisterAll).not.toHaveBeenCalled();
  });

  it("unregisters only the owned capture shortcut during teardown", () => {
    const registrar = createShortcutRegistrar({ onCapture: vi.fn() });
    registrar.register(baseSettings);

    registrar.unregister();

    expect(unregister).toHaveBeenCalledWith("Alt+S");
    expect(unregisterAll).not.toHaveBeenCalled();
  });
});
