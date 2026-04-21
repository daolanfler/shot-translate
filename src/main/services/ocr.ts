import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createWorker } from "tesseract.js";
import type { OcrResult } from "../../shared/types";

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

function getTessdataCachePath() {
  const cachePath = path.join(app.getPath("userData"), "tessdata");
  fs.mkdirSync(cachePath, { recursive: true });
  return cachePath;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker(["eng", "chi_sim"], 1, {
        cachePath: getTessdataCachePath()
      });
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
