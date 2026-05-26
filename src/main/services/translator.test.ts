import { describe, expect, it } from "vitest";
import {
  TranslationServiceError,
  classifyNetworkError,
  classifyStatus,
  parseJsonPayload,
  toUserMessage
} from "./translator";

describe("translator error classification", () => {
  it.each([
    [401, "unauthorized", "API key was rejected."],
    [403, "forbidden", "The API account does not have access."],
    [404, "model_not_found", "The API endpoint or model was not found."],
    [429, "rate_limited", "The API rate limit was reached."],
    [500, "bad_response", "Translation request failed with HTTP 500."]
  ])("maps HTTP %i to %s", (status, code, message) => {
    const error = classifyStatus(status, "detail");

    expect(error.code).toBe(code);
    expect(error.userMessage).toBe(message);
    expect(error.details).toBe("detail");
  });

  it("classifies timeout-like network failures", () => {
    const error = classifyNetworkError(new Error("The operation timed out"), "");

    expect(error.code).toBe("timeout");
    expect(error.userMessage).toBe("The translation request timed out.");
  });

  it("classifies proxy failures when a proxy is configured", () => {
    const error = classifyNetworkError(new Error("connect ECONNREFUSED"), "http://127.0.0.1:7890");

    expect(error.code).toBe("proxy_failed");
    expect(error.userMessage).toBe("The configured HTTP proxy could not be used.");
    expect(error.details).toContain("http://127.0.0.1:7890");
  });

  it("returns the public message for service errors", () => {
    const error = new TranslationServiceError("missing_api_key", "Missing API key.");

    expect(toUserMessage(error)).toBe("Missing API key.");
  });
});

describe("parseJsonPayload", () => {
  it("extracts JSON from a plain response", () => {
    expect(parseJsonPayload('{"translatedText":"Hello","sourceLanguage":"zh-CN"}')).toEqual({
      translatedText: "Hello",
      sourceLanguage: "zh-CN"
    });
  });

  it("extracts JSON from surrounding text", () => {
    expect(parseJsonPayload('Result: {"translatedText":"Hello"} done')).toEqual({
      translatedText: "Hello"
    });
  });

  it("throws a service error when JSON is missing", () => {
    expect(() => parseJsonPayload("no json here")).toThrow(TranslationServiceError);
  });

  it("throws a service error when JSON is invalid", () => {
    expect(() => parseJsonPayload("{not-json}")).toThrow(TranslationServiceError);
  });
});
