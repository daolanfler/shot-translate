import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted: Record<string, unknown> = {};
const loginItemSettings = vi.fn();

vi.mock("electron", () => ({
  app: {
    setLoginItemSettings: loginItemSettings
  },
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}));

vi.mock("./store", () => ({
  readJsonFile: vi.fn((name: string, fallback: unknown) => persisted[name] ?? fallback),
  writeJsonFile: vi.fn(async (name: string, value: unknown) => {
    persisted[name] = value;
  })
}));

describe("settings service OCR language profiles", () => {
  beforeEach(async () => {
    for (const key of Object.keys(persisted)) {
      delete persisted[key];
    }

    loginItemSettings.mockReset();
    const settings = await import("./settings");
    settings.resetSettingsForTests();
  });

  it("infers the default Chinese/English profile from legacy OCR languages", async () => {
    persisted["settings.json"] = {
      ocrLanguages: ["chi_sim", "eng"]
    };

    const settings = await import("./settings");
    const current = settings.getSettings();

    expect(current.ocrLanguageProfile).toBe("zh-en");
    expect(current.ocrLanguages).toEqual(["chi_sim", "eng"]);
  });

  it("keeps custom legacy OCR languages in manual profile", async () => {
    persisted["settings.json"] = {
      ocrLanguages: ["fra", "eng"]
    };

    const settings = await import("./settings");
    const current = settings.getSettings();

    expect(current.ocrLanguageProfile).toBe("manual");
    expect(current.ocrLanguages).toEqual(["eng", "fra"]);
  });

  it("persists OCR profile and language updates", async () => {
    const settings = await import("./settings");

    const current = await settings.updateSettings({
      ocrLanguageProfile: "english",
      ocrLanguages: ["eng"]
    });

    expect(current.ocrLanguageProfile).toBe("english");
    expect(current.ocrLanguages).toEqual(["eng"]);
    expect(persisted["settings.json"]).toMatchObject({
      ocrLanguageProfile: "english",
      ocrLanguages: ["eng"]
    });
  });
});
