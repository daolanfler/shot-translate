import { describe, expect, it } from "vitest";
import {
  validateCaptureSubmitPayload,
  validateClipboardText,
  validateHistoryId,
  validateRendererError,
  validateResultWindowMovePayload,
  validateRetrySourceText,
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

  it("rejects invalid settings value shapes", () => {
    expect(() => validateSettingsPatch({ ocrLanguageProfile: "klingon" })).toThrow();
    expect(() => validateSettingsPatch({ ocrPreprocessing: { enabled: true } })).toThrow();
    expect(() => validateSettingsPatch({ launchOnStartup: "yes" })).toThrow();
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

  it("validates history ids and optional retry source text", () => {
    expect(validateHistoryId(" item-1 ")).toBe("item-1");
    expect(() => validateHistoryId(" ")).toThrow("history id is required");
    expect(validateRetrySourceText(undefined)).toBeUndefined();
    expect(validateRetrySourceText("corrected text")).toBe("corrected text");
    expect(() => validateRetrySourceText(null)).toThrow();
  });

  it("validates renderer error payloads and clipboard text", () => {
    expect(validateRendererError({ message: " boom ", stack: "trace" })).toEqual({
      message: "boom",
      stack: "trace"
    });
    expect(() => validateRendererError({ message: " " })).toThrow("renderer error message is required");
    expect(validateClipboardText("copy me")).toBe("copy me");
    expect(() => validateClipboardText(42)).toThrow();
  });
});
