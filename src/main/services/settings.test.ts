import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted: Record<string, unknown> = {};
const loginItemSettings = vi.fn();
const readJsonFile = vi.fn((name: string, fallback: unknown) => persisted[name] ?? fallback);
const writeJsonFile = vi.fn(async (name: string, value: unknown) => {
  persisted[name] = value;
});

vi.mock("electron", () => ({
  app: {
    setLoginItemSettings: loginItemSettings
  },
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}));

vi.mock("./store", () => ({
  readJsonFile,
  writeJsonFile
}));

describe("settings service OCR language profiles", () => {
  beforeEach(async () => {
    for (const key of Object.keys(persisted)) {
      delete persisted[key];
    }

    loginItemSettings.mockReset();
    readJsonFile.mockClear();
    writeJsonFile.mockClear();
    writeJsonFile.mockImplementation(async (name: string, value: unknown) => {
      persisted[name] = value;
    });
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

  it("serializes concurrent updates so later patches persist on top of earlier patches", async () => {
    const pendingWrites: Array<{ name: string; value: unknown; resolve: () => void }> = [];
    writeJsonFile.mockImplementation(
      (name: string, value: unknown) =>
        new Promise<void>((resolve) => {
          pendingWrites.push({
            name,
            value,
            resolve: () => {
              persisted[name] = value;
              resolve();
            }
          });
        })
    );
    const settings = await import("./settings");

    const first = settings.updateSettings({ model: "first-model" });
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingWrites).toHaveLength(1);

    const second = settings.updateSettings({ targetLanguage: "en" });
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingWrites).toHaveLength(1);

    pendingWrites[0].resolve();
    await expect(first).resolves.toMatchObject({ model: "first-model", targetLanguage: "zh-CN" });
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingWrites).toHaveLength(2);
    expect(pendingWrites[1].value).toMatchObject({
      model: "first-model",
      targetLanguage: "en"
    });

    pendingWrites[1].resolve();
    await expect(second).resolves.toMatchObject({ model: "first-model", targetLanguage: "en" });
    expect(persisted["settings.json"]).toMatchObject({
      model: "first-model",
      targetLanguage: "en"
    });
  });
});
