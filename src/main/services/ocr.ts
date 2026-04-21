import { createWorker } from "tesseract.js";
import type { OcrResult } from "../../shared/types";

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker(["eng", "chi_sim"]);
      return worker;
    })();
  }

  return workerPromise;
}

export async function recognizeText(imageDataUrl: string): Promise<OcrResult> {
  const worker = await getWorker();
  const result = await worker.recognize(imageDataUrl);

  return {
    text: result.data.text.trim(),
    confidence: result.data.confidence
  };
}

