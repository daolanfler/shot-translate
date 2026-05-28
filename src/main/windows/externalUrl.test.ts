import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl } from "./externalUrl";

describe("isAllowedExternalUrl", () => {
  it("allows only safe external protocols", () => {
    expect(isAllowedExternalUrl("https://example.test")).toBe(true);
    expect(isAllowedExternalUrl("mailto:support@example.test")).toBe(true);
    expect(isAllowedExternalUrl("http://example.test")).toBe(false);
    expect(isAllowedExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("not a url")).toBe(false);
  });
});
