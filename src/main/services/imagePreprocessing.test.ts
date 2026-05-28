import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeImagePreprocessingOptions,
  preprocessImageForOcr,
  type ImagePreprocessingOptions
} from "./imagePreprocessing";

const imageState = {
  size: {
    width: 2,
    height: 1
  },
  bitmap: Buffer.from([10, 20, 30, 255, 200, 210, 220, 255]),
  outputDataUrl: "data:image/png;base64,processed"
};
const bitmapsPassedToCreateFromBitmap: Uint8Array[] = [];

vi.mock("electron", () => {
  const createImage = (bitmap: Uint8Array = imageState.bitmap, size = imageState.size) => ({
    isEmpty: () => false,
    getSize: () => size,
    resize: vi.fn(({ width, height }: { width: number; height: number }) =>
      createImage(Buffer.from(bitmap), { width, height })
    ),
    toBitmap: () => Buffer.from(bitmap),
    toDataURL: () => imageState.outputDataUrl,
    toPNG: () => Buffer.from("png")
  });

  return {
    app: {
      getPath: () => "test-user-data"
    },
    nativeImage: {
      createFromDataURL: vi.fn(() => createImage()),
      createFromBitmap: vi.fn((bitmap: Uint8Array, size: { width: number; height: number }) => {
        bitmapsPassedToCreateFromBitmap.push(Buffer.from(bitmap));
        return createImage(bitmap, size);
      })
    }
  };
});

describe("normalizeImagePreprocessingOptions", () => {
  it("keeps defaults conservative and clamps bounded options", () => {
    expect(normalizeImagePreprocessingOptions()).toMatchObject<ImagePreprocessingOptions>({
      enabled: false,
      upscale: 1,
      grayscale: false,
      contrast: 0,
      threshold: {
        enabled: false
      },
      debugDump: false
    });

    expect(
      normalizeImagePreprocessingOptions({
        enabled: true,
        upscale: 7 as 1,
        contrast: 400,
        threshold: {
          enabled: true,
          value: 999
        }
      })
    ).toMatchObject({
      enabled: true,
      upscale: 1,
      contrast: 100,
      threshold: {
        enabled: true,
        value: 255
      }
    });
  });
});

describe("preprocessImageForOcr", () => {
  beforeEach(() => {
    imageState.outputDataUrl = "data:image/png;base64,processed";
    bitmapsPassedToCreateFromBitmap.length = 0;
  });

  it("returns the original image through the shared path when disabled", async () => {
    const result = await preprocessImageForOcr("data:image/png;base64,original");

    expect(result.imageDataUrl).toBe("data:image/png;base64,original");
    expect(result.metadata).toMatchObject({
      enabled: false,
      operations: [],
      originalSize: null,
      processedSize: null
    });
  });

  it("applies enabled operations and returns processed image metadata", async () => {
    const result = await preprocessImageForOcr("data:image/png;base64,original", {
      enabled: true,
      upscale: 2,
      grayscale: true,
      contrast: 20,
      threshold: {
        enabled: true,
        value: 128
      }
    });

    expect(result.imageDataUrl).toBe("data:image/png;base64,processed");
    expect(result.metadata).toMatchObject({
      enabled: true,
      operations: ["upscale:2x", "grayscale", "contrast:20", "threshold:128"],
      originalSize: {
        width: 2,
        height: 1
      },
      processedSize: {
        width: 4,
        height: 2
      }
    });
    expect(Array.from(bitmapsPassedToCreateFromBitmap[0] ?? [])).toEqual([
      0,
      0,
      0,
      255,
      255,
      255,
      255,
      255
    ]);
  });
});
