import fs from "node:fs/promises";
import path from "node:path";
import { app, nativeImage } from "electron";
import type { OcrPreprocessingSettings } from "../../shared/types";

export type ThresholdOptions = {
  enabled: boolean;
  value?: number;
};

export type ImagePreprocessingOptions = OcrPreprocessingSettings & {
  debugDump: boolean;
};

export type ImagePreprocessingMetadata = {
  enabled: boolean;
  operations: string[];
  originalSize: {
    width: number;
    height: number;
  } | null;
  processedSize: {
    width: number;
    height: number;
  } | null;
  elapsedMs: number;
};

export type ImagePreprocessingResult = {
  imageDataUrl: string;
  metadata: ImagePreprocessingMetadata;
};

export const defaultImagePreprocessingOptions: ImagePreprocessingOptions = {
  enabled: false,
  upscale: 1,
  grayscale: false,
  contrast: 0,
  threshold: {
    enabled: false
  },
  debugDump: false
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function normalizeThreshold(options: ThresholdOptions): ThresholdOptions {
  if (!options.enabled) {
    return {
      enabled: false
    };
  }

  return {
    enabled: true,
    value: clamp(Math.round(options.value ?? 128), 0, 255)
  };
}

export function normalizeImagePreprocessingOptions(
  options?: Partial<ImagePreprocessingOptions>
): ImagePreprocessingOptions {
  const upscale = options?.upscale;

  return {
    enabled: options?.enabled ?? defaultImagePreprocessingOptions.enabled,
    upscale: upscale === 2 || upscale === 3 ? upscale : defaultImagePreprocessingOptions.upscale,
    grayscale: options?.grayscale ?? defaultImagePreprocessingOptions.grayscale,
    contrast: clamp(options?.contrast ?? defaultImagePreprocessingOptions.contrast, -100, 100),
    threshold: normalizeThreshold(options?.threshold ?? defaultImagePreprocessingOptions.threshold),
    debugDump: options?.debugDump ?? process.env.SHOT_TRANSLATE_OCR_DEBUG_IMAGES === "1"
  };
}

function buildOperations(options: ImagePreprocessingOptions): string[] {
  const operations: string[] = [];

  if (!options.enabled) {
    return operations;
  }

  if (options.upscale > 1) {
    operations.push(`upscale:${options.upscale}x`);
  }

  if (options.grayscale) {
    operations.push("grayscale");
  }

  if (options.contrast !== 0) {
    operations.push(`contrast:${options.contrast}`);
  }

  if (options.threshold.enabled) {
    operations.push(`threshold:${options.threshold.value ?? 128}`);
  }

  return operations;
}

function adjustContrast(channel: number, contrast: number): number {
  if (contrast === 0) {
    return channel;
  }

  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  return clamp(Math.round(factor * (channel - 128) + 128), 0, 255);
}

function processBitmap(bitmap: Buffer, options: ImagePreprocessingOptions): Buffer {
  const next = Buffer.from(bitmap);

  for (let offset = 0; offset < next.length; offset += 4) {
    let blue = next[offset];
    let green = next[offset + 1];
    let red = next[offset + 2];

    if (options.grayscale || options.threshold.enabled) {
      const luminance = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
      blue = luminance;
      green = luminance;
      red = luminance;
    }

    red = adjustContrast(red, options.contrast);
    green = adjustContrast(green, options.contrast);
    blue = adjustContrast(blue, options.contrast);

    if (options.threshold.enabled) {
      const threshold = options.threshold.value ?? 128;
      const value = red >= threshold ? 255 : 0;
      blue = value;
      green = value;
      red = value;
    }

    next[offset] = blue;
    next[offset + 1] = green;
    next[offset + 2] = red;
  }

  return next;
}

async function dumpDebugImages(originalDataUrl: string, processedDataUrl: string): Promise<void> {
  const debugDir = path.join(app.getPath("userData"), "ocr-debug");
  await fs.mkdir(debugDir, { recursive: true });
  await fs.writeFile(path.join(debugDir, "last-original.png"), nativeImage.createFromDataURL(originalDataUrl).toPNG());
  await fs.writeFile(path.join(debugDir, "last-processed.png"), nativeImage.createFromDataURL(processedDataUrl).toPNG());
}

export async function preprocessImageForOcr(
  imageDataUrl: string,
  options?: Partial<ImagePreprocessingOptions>
): Promise<ImagePreprocessingResult> {
  const startedAt = Date.now();
  const normalized = normalizeImagePreprocessingOptions(options);

  if (!normalized.enabled) {
    return {
      imageDataUrl,
      metadata: {
        enabled: false,
        operations: buildOperations(normalized),
        originalSize: null,
        processedSize: null,
        elapsedMs: Date.now() - startedAt
      }
    };
  }

  const image = nativeImage.createFromDataURL(imageDataUrl);
  const originalSize = image.isEmpty() ? null : image.getSize();

  if (image.isEmpty()) {
    return {
      imageDataUrl,
      metadata: {
        enabled: true,
        operations: buildOperations(normalized),
        originalSize,
        processedSize: originalSize,
        elapsedMs: Date.now() - startedAt
      }
    };
  }

  const scaledImage =
    normalized.upscale > 1 && originalSize
      ? image.resize({
          width: originalSize.width * normalized.upscale,
          height: originalSize.height * normalized.upscale,
          quality: "best"
        })
      : image;
  const processedSize = scaledImage.getSize();
  const processedBitmap = processBitmap(scaledImage.toBitmap(), normalized);
  const processedImage = nativeImage.createFromBitmap(processedBitmap, processedSize);
  const processedDataUrl = processedImage.toDataURL();

  if (normalized.debugDump) {
    await dumpDebugImages(imageDataUrl, processedDataUrl);
  }

  return {
    imageDataUrl: processedDataUrl,
    metadata: {
      enabled: true,
      operations: buildOperations(normalized),
      originalSize,
      processedSize,
      elapsedMs: Date.now() - startedAt
    }
  };
}
