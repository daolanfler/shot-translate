import { beforeEach, describe, expect, it, vi } from "vitest";
import { TesseractOcrProvider, normaliseOcrLanguages, type OcrProvider } from "./ocrProvider";

describe("normaliseOcrLanguages", () => {
  it("deduplicates, trims, sorts, and falls back to English", () => {
    expect(normaliseOcrLanguages([" eng ", "chi_sim", "eng", ""])).toEqual(["chi_sim", "eng"]);
    expect(normaliseOcrLanguages(["", "   "])).toEqual(["eng"]);
  });
});

describe("TesseractOcrProvider", () => {
  const recognize = vi.fn();
  const terminate = vi.fn();
  const createTesseractWorker = vi.fn();

  beforeEach(() => {
    recognize.mockReset();
    terminate.mockReset();
    createTesseractWorker.mockReset();
    recognize.mockResolvedValue({
      data: {
        text: " Hello OCR ",
        confidence: 92
      }
    });
    terminate.mockResolvedValue(undefined);
    createTesseractWorker.mockResolvedValue({
      recognize,
      terminate
    });
  });

  it("recognizes through a cached worker and emits provider progress", async () => {
    const provider = new TesseractOcrProvider({
      getCachePath: () => "test-tessdata",
      createTesseractWorker
    });
    const messages: string[] = [];

    const result = await provider.recognize(
      {
        imageDataUrl: "data:image/png;base64,test",
        languages: ["eng", "eng"]
      },
      (event) => messages.push(event.message)
    );
    await provider.recognize({
      imageDataUrl: "data:image/png;base64,test-2",
      languages: [" eng "]
    });

    expect(result).toEqual({
      text: "Hello OCR",
      confidence: 92
    });
    expect(messages).toEqual(["Loading OCR language data", "Recognizing text"]);
    expect(createTesseractWorker).toHaveBeenCalledTimes(1);
    expect(createTesseractWorker).toHaveBeenCalledWith(["eng"], 1, {
      cachePath: "test-tessdata"
    });
  });

  it("disposes the previous worker when the language set changes", async () => {
    const provider = new TesseractOcrProvider({
      getCachePath: () => "test-tessdata",
      createTesseractWorker
    });

    await provider.recognize({
      imageDataUrl: "data:image/png;base64,test",
      languages: ["eng"]
    });
    await provider.recognize({
      imageDataUrl: "data:image/png;base64,test",
      languages: ["chi_sim", "eng"]
    });

    expect(createTesseractWorker).toHaveBeenCalledTimes(2);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("disposes the worker after recognition failures", async () => {
    const provider = new TesseractOcrProvider({
      getCachePath: () => "test-tessdata",
      createTesseractWorker
    });
    recognize.mockRejectedValueOnce(new Error("OCR failed"));

    await expect(
      provider.recognize({
        imageDataUrl: "data:image/png;base64,test",
        languages: ["eng"]
      })
    ).rejects.toThrow("OCR failed");

    expect(terminate).toHaveBeenCalledTimes(1);
  });
});

describe("OCR facade", () => {
  beforeEach(async () => {
    const ocr = await import("./ocr");
    await ocr.resetOcrProviderForTests();
  });

  it("uses the default provider id and adapts progress messages", async () => {
    const ocr = await import("./ocr");
    const provider: OcrProvider = {
      id: "tesseract",
      recognize: vi.fn(async (_input, onProgress) => {
        onProgress?.({
          providerId: "tesseract",
          stage: "loading",
          message: "Mock loading"
        });
        return {
          text: "mock text",
          confidence: 88
        };
      }),
      dispose: vi.fn(async () => {})
    };
    const messages: string[] = [];

    ocr.setOcrProviderForTests(provider);
    const result = await ocr.recognizeText("data:image/png;base64,test", ["eng"], (message) => {
      messages.push(message);
    });
    await ocr.terminateOcrWorker();

    expect(ocr.DEFAULT_OCR_PROVIDER_ID).toBe("tesseract");
    expect(result).toEqual({
      text: "mock text",
      confidence: 88
    });
    expect(messages).toEqual(["Mock loading"]);
    expect(provider.dispose).toHaveBeenCalledTimes(1);
  });
});
