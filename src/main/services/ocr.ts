import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createWorker } from "tesseract.js";
import type { OcrResult } from "../../shared/types";

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;

function getTessdataCachePath() {
  const cachePath = path.join(app.getPath("userData"), "tessdata");
  fs.mkdirSync(cachePath, { recursive: true });
  return cachePath;
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = createWorker(["eng", "chi_sim"], 1, {
      cachePath: getTessdataCachePath()
    });
  }

  return workerPromise;
}

export async function recognizeText(imageDataUrl: string): Promise<OcrResult> {
  let worker: TesseractWorker;

  try {
    worker = await getWorker();
  } catch (error) {
    // Worker init failed — reset so the next call retries cleanly instead of
    // re-throwing the cached rejection forever.
    workerPromise = null;
    throw error;
  }

  try {
    const result = await worker.recognize(imageDataUrl);
    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence
    };
  } catch (error) {
    // Recognition failure may leave the worker in a bad state. Tear it down so
    // the next recognize() spins up a fresh worker.
    workerPromise = null;
    await worker.terminate().catch(() => {});
    throw error;
  }
}

export async function terminateOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;

  if (!pending) {
    return;
  }

  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Worker never finished initializing or already terminated — nothing to do.
  }
}
