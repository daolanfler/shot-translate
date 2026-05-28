import type { OcrResult } from "../../shared/types";
import { DEFAULT_OCR_PROVIDER_ID, TesseractOcrProvider, type OcrProvider } from "./ocrProvider";

export { DEFAULT_OCR_PROVIDER_ID };

let provider: OcrProvider | null = null;

function getOcrProvider(): OcrProvider {
  if (!provider) {
    provider = new TesseractOcrProvider();
  }

  return provider;
}

export function setOcrProviderForTests(nextProvider: OcrProvider): void {
  provider = nextProvider;
}

export async function resetOcrProviderForTests(): Promise<void> {
  await terminateOcrWorker();
}

export async function recognizeText(
  imageDataUrl: string,
  languages: string[],
  onStatus?: (message: string) => void
): Promise<OcrResult> {
  return getOcrProvider().recognize(
    {
      imageDataUrl,
      languages
    },
    (event) => {
      onStatus?.(event.message);
    }
  );
}

export async function terminateOcrWorker(): Promise<void> {
  const currentProvider = provider;
  provider = null;
  await currentProvider?.dispose();
}
