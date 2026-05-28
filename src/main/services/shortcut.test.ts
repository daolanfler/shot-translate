import { describe, expect, it } from "vitest";
import { isLikelyAccelerator } from "./shortcut";

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
