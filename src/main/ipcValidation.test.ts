import { describe, expect, it } from "vitest";
import {
  validateCaptureSubmitPayload,
  validateResultWindowMovePayload,
  validateSettingsPatch,
  validateUpdateSource
} from "./ipcValidation";

describe("ipcValidation", () => {
  it("accepts valid settings patches and strips unsupported prototypes", () => {
    expect(
      validateSettingsPatch({
        shortcut: " Alt+S ",
        ocrLanguages: [" eng ", "chi_sim"],
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
        launchOnStartup: true
      })
    ).toEqual({
      shortcut: "Alt+S",
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
      launchOnStartup: true
    });
  });

  it("rejects unsupported settings fields", () => {
    expect(() => validateSettingsPatch({ apiKey: "ok", extra: true })).toThrow("Unsupported settings field");
  });

  it("validates capture submit payload shape", () => {
    expect(
      validateCaptureSubmitPayload({
        displayId: 1,
        selectionRect: { x: 1, y: 2, width: 3, height: 4 }
      })
    ).toEqual({
      displayId: 1,
      selectionRect: { x: 1, y: 2, width: 3, height: 4 }
    });

    expect(() =>
      validateCaptureSubmitPayload({
        displayId: 1,
        selectionRect: { x: 1, y: 2, width: 0, height: 4 }
      })
    ).toThrow("selectionRect");
  });

  it("rejects invalid result movement and update sources", () => {
    expect(validateResultWindowMovePayload({ deltaX: 1, deltaY: -2 })).toEqual({ deltaX: 1, deltaY: -2 });
    expect(() => validateResultWindowMovePayload({ deltaX: Number.NaN, deltaY: 1 })).toThrow("finite");
    expect(validateUpdateSource("github")).toBe("github");
    expect(() => validateUpdateSource("file")).toThrow("Update source");
  });
});
