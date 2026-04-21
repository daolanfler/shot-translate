import type { AppSettings, TranslationResult } from "../../shared/types";
import { ProxyAgent } from "undici";

interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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

function parseJsonPayload(raw: string) {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("The translation service did not return JSON.");
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as {
    translatedText?: string;
    sourceLanguage?: string;
  };
}

export async function translateText(
  text: string,
  settings: AppSettings
): Promise<TranslationResult> {
  if (!settings.apiKey) {
    throw new Error("Missing API key. Configure it in Settings first.");
  }

  const startedAt = Date.now();
  const proxyUrl = settings.apiProxyUrl.trim();
  const requestInit: RequestInit & { dispatcher?: ProxyAgent } = {
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

  let response: Response;
  try {
    response = await fetch(`${settings.apiBaseUrl}/chat/completions`, requestInit);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    const cause =
      error instanceof Error && "cause" in error && error.cause
        ? ` Cause: ${String(error.cause)}`
        : "";
    const proxyHint = proxyUrl
      ? ` Proxy: ${proxyUrl}.`
      : " If your network requires a proxy, configure HTTP proxy in Settings.";
    throw new Error(`Translation network request failed: ${message}.${cause}${proxyHint}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Translation request failed: ${response.status} ${detail}`);
  }

  const data = (await response.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("The translation service returned an empty response.");
  }

  const payload = parseJsonPayload(content);

  if (!payload.translatedText) {
    throw new Error("The translation response is missing translatedText.");
  }

  return {
    translatedText: payload.translatedText,
    sourceLanguage: payload.sourceLanguage ?? "auto",
    elapsedMs: Date.now() - startedAt
  };
}
