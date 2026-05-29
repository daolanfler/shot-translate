import { describe, expect, it } from "vitest";
import { formatActionError, getErrorMessage } from "./errors";

describe("renderer error helpers", () => {
  describe("getErrorMessage", () => {
    it("returns non-empty Error messages", () => {
      expect(getErrorMessage(new Error("Boom"))).toBe("Boom");
    });

    it("returns non-empty string errors", () => {
      expect(getErrorMessage("Bad input")).toBe("Bad input");
    });

    it("falls back for empty or unknown errors", () => {
      expect(getErrorMessage("   ")).toBe("Unknown error.");
      expect(getErrorMessage(null)).toBe("Unknown error.");
    });
  });

  describe("formatActionError", () => {
    it("prefixes the action label", () => {
      expect(formatActionError("Save failed", new Error("Invalid field"))).toBe("Save failed: Invalid field");
    });
  });
});
