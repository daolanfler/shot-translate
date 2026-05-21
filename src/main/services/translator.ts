import type { AppSettings, ServiceErrorCode, ServiceResult, TranslationResult } from "../../shared/types";
import { fetch, ProxyAgent } from "undici";

interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class TranslationServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly userMessage: string;
  readonly details?: string;

  constructor(code: ServiceErrorCode, userMessage: string, details?: string) {
    super(details ? `${userMessage} ${details}` : userMessage);
    this.name = "TranslationServiceError";
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
  }
}

function buildPrompt(text: string, targetLanguage: string) {
  return [
    "You are a translation engine.",
    "Detect the source language automatically.",
    `Translate the text into ${targetLanguage}.`,
    "Return strict JSON with keys: translatedText, sourceLanguage.",
    "Do not add markdown fences."
  ].join(" ");
}

function classifyStatus(status: number, detail: string): TranslationServiceError {
  if (status === 401) {
    return new TranslationServiceError("unauthorized", "API key was rejected.", detail);
  }

  if (status === 403) {
    return new TranslationServiceError("forbidden", "The API account does not have access.", detail);
  }

  if (status === 404) {
    return new TranslationServiceError("model_not_found", "The API endpoint or model was not found.", detail);
  }

  if (status === 429) {
    return new TranslationServiceError("rate_limited", "The API rate limit was reached.", detail);
  }

  return new TranslationServiceError(
    "bad_response",
    `Translation request failed with HTTP ${status}.`,
    detail
  );
}

function classifyNetworkError(error: unknown, proxyUrl: string): TranslationServiceError {
  const message = error instanceof Error ? error.message : "Unknown network error";
  const cause =
    error instanceof Error && "cause" in error && error.cause
      ? ` Cause: ${String(error.cause)}`
      : "";
  const detail = `${message}.${cause}`;
  const lower = detail.toLowerCase();

  if (lower.includes("timeout") || lower.includes("aborted")) {
    return new TranslationServiceError("timeout", "The translation request timed out.", detail);
  }

  if (proxyUrl) {
    return new TranslationServiceError(
      "proxy_failed",
      "The configured HTTP proxy could not be used.",
      `Proxy: ${proxyUrl}. ${detail}`
    );
  }

  if (lower.includes("invalid url") || lower.includes("failed to parse url")) {
    return new TranslationServiceError("invalid_base_url", "The API base URL is invalid.", detail);
  }

  return new TranslationServiceError(
    "network_error",
    "Could not reach the translation API. Configure a proxy if your network requires one.",
    detail
  );
}

export function toUserMessage(error: unknown): string {
  if (error instanceof TranslationServiceError) {
    return error.userMessage;
  }

  return error instanceof Error ? error.message : "Unknown error";
}

function parseJsonPayload(raw: string) {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new TranslationServiceError(
      "bad_response",
      "The translation service returned an unreadable response.",
      raw
    );
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as {
      translatedText?: string;
      sourceLanguage?: string;
    };
  } catch (error) {
    throw new TranslationServiceError(
      "bad_response",
      "The translation service returned invalid JSON.",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function requestChatCompletion(text: string, settings: AppSettings): Promise<string> {
  if (!settings.apiKey) {
    throw new TranslationServiceError(
      "missing_api_key",
      "Missing API key. Configure it in Settings first."
    );
  }

  const proxyUrl = settings.apiProxyUrl.trim();
  const requestInit: NonNullable<Parameters<typeof fetch>[1]> & { dispatcher?: ProxyAgent } = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildPrompt(text, settings.targetLanguage)
        },
        {
          role: "user",
          content: text
        }
      ]
    })
  };

  if (proxyUrl) {
    requestInit.dispatcher = new ProxyAgent(proxyUrl);
  }

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    const baseUrl = settings.apiBaseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new TranslationServiceError("invalid_base_url", "The API base URL is empty.");
    }

    response = await fetch(`${baseUrl}/chat/completions`, requestInit);
  } catch (error) {
    if (error instanceof TranslationServiceError) {
      throw error;
    }

    throw classifyNetworkError(error, proxyUrl);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw classifyStatus(response.status, detail);
  }

  const data = (await response.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new TranslationServiceError(
      "bad_response",
      "The translation service returned an empty response."
    );
  }

  return content;
}

export async function translateText(
  text: string,
  settings: AppSettings
): Promise<TranslationResult> {
  const startedAt = Date.now();
  const content = await requestChatCompletion(text, settings);
  const payload = parseJsonPayload(content);

  if (!payload.translatedText) {
    throw new TranslationServiceError(
      "bad_response",
      "The translation response is missing translatedText."
    );
  }

  return {
    translatedText: payload.translatedText,
    sourceLanguage: payload.sourceLanguage ?? "auto",
    elapsedMs: Date.now() - startedAt
  };
}

export async function testTranslationConnection(settings: AppSettings): Promise<ServiceResult> {
  try {
    await requestChatCompletion("Connection test", {
      ...settings,
      targetLanguage: "English"
    });
    return {
      ok: true,
      message: `Connected successfully with model ${settings.model}.`
    };
  } catch (error) {
    if (error instanceof TranslationServiceError) {
      return {
        ok: false,
        code: error.code,
        message: error.userMessage,
        details: error.details
      };
    }

    return {
      ok: false,
      code: "unknown",
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
