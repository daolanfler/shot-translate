import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createWorker } from "tesseract.js";
import type { OcrResult } from "../../shared/types";

export type OcrProviderId = "tesseract";

export type OcrProgressStage = "loading" | "recognizing";

export type OcrProgressEvent = {
  providerId: OcrProviderId;
  stage: OcrProgressStage;
  message: string;
  progress?: number;
};

export type OcrRecognizeInput = {
  imageDataUrl: string;
  languages: string[];
};

export interface OcrProvider {
  readonly id: OcrProviderId;
  recognize(input: OcrRecognizeInput, onProgress?: (event: OcrProgressEvent) => void): Promise<OcrResult>;
  dispose(): Promise<void>;
}

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;
type CreateTesseractWorker = (
  languages: string[],
  oem: number,
  options: NonNullable<Parameters<typeof createWorker>[2]>
) => Promise<TesseractWorker>;

const FALLBACK_LANGUAGES = ["eng"];

export const DEFAULT_OCR_PROVIDER_ID: OcrProviderId = "tesseract";

export function normaliseOcrLanguages(languages: string[]): string[] {
  const trimmed = languages.map((lang) => lang.trim()).filter(Boolean);
  return trimmed.length > 0 ? Array.from(new Set(trimmed)).sort() : FALLBACK_LANGUAGES;
}

function getDefaultTessdataCachePath(): string {
  const cachePath = path.join(app.getPath("userData"), "tessdata");
  fs.mkdirSync(cachePath, { recursive: true });
  return cachePath;
}

export class TesseractOcrProvider implements OcrProvider {
  readonly id = DEFAULT_OCR_PROVIDER_ID;

  private workerPromise: Promise<TesseractWorker> | null = null;
  private workerKey: string | null = null;
  private readonly getCachePath: () => string;
  private readonly createTesseractWorker: CreateTesseractWorker;

  constructor(options?: {
    getCachePath?: () => string;
    createTesseractWorker?: CreateTesseractWorker;
  }) {
    this.getCachePath = options?.getCachePath ?? getDefaultTessdataCachePath;
    this.createTesseractWorker = options?.createTesseractWorker ?? createWorker;
  }

  async recognize(input: OcrRecognizeInput, onProgress?: (event: OcrProgressEvent) => void): Promise<OcrResult> {
    const languages = normaliseOcrLanguages(input.languages);
    let worker: TesseractWorker;

    try {
      onProgress?.({
        providerId: this.id,
        stage: "loading",
        message: "Loading OCR language data"
      });
      worker = await this.getWorker(languages);
    } catch (error) {
      this.workerPromise = null;
      this.workerKey = null;
      throw error;
    }

    try {
      onProgress?.({
        providerId: this.id,
        stage: "recognizing",
        message: "Recognizing text"
      });
      const result = await worker.recognize(input.imageDataUrl);
      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence
      };
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  async dispose(): Promise<void> {
    const pending = this.workerPromise;
    this.workerPromise = null;
    this.workerKey = null;

    if (!pending) {
      return;
    }

    try {
      const worker = await pending;
      await worker.terminate();
    } catch {
      // Worker init never succeeded or already tore down.
    }
  }

  private async getWorker(languages: string[]): Promise<TesseractWorker> {
    const requestedKey = languages.join("+");

    if (this.workerPromise && this.workerKey === requestedKey) {
      return this.workerPromise;
    }

    if (this.workerPromise) {
      await this.dispose();
    }

    this.workerKey = requestedKey;
    this.workerPromise = this.createTesseractWorker(languages, 1, {
      cachePath: this.getCachePath()
    });

    return this.workerPromise;
  }
}
