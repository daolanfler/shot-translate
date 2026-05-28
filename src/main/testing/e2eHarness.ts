import { randomUUID } from "node:crypto";
import { BrowserWindow, ipcMain } from "electron";
import type {
  AppSettings,
  E2eMockCaptureOptions,
  E2eState,
  OcrResult,
  ScreenRect,
  ServiceResult,
  TranslationResult
} from "../../shared/types";
import { clearHistory, listHistory, resetHistoryForTests } from "../services/history";
import { defaultSettings, getSettings, resetSettingsForTests, updateSettings } from "../services/settings";

type WorkflowState = "idle" | "capturing" | "processing";
type OcrProgressCallback = (message: string) => void;

interface E2eHarnessDeps {
  getWorkflowState: () => WorkflowState;
  setWorkflowState: (next: WorkflowState, message?: string) => void;
  closeCaptureWindows: () => void;
  closeResultWindow: () => void;
  processCaptureResult: (imageDataUrl: string, selectionRect?: ScreenRect) => Promise<void>;
}

const defaultMockCaptureOptions: Required<E2eMockCaptureOptions> = {
  ocrText: "Hello world",
  translatedText: "你好，世界",
  translationError: ""
};

export function isE2eMode() {
  return process.env.SHOT_TRANSLATE_E2E === "1";
}

export class E2eHarness {
  private mockCaptureOptions = { ...defaultMockCaptureOptions };

  recognizeText(onProgress: OcrProgressCallback): OcrResult {
    onProgress("Mock OCR complete");
    return {
      text: this.mockCaptureOptions.ocrText,
      confidence: this.mockCaptureOptions.ocrText ? 99 : 0
    };
  }

  translateText(): TranslationResult {
    if (this.mockCaptureOptions.translationError) {
      throw new Error(this.mockCaptureOptions.translationError);
    }

    return {
      translatedText: this.mockCaptureOptions.translatedText,
      sourceLanguage: "en",
      elapsedMs: 1
    };
  }

  testApiConnection(patch: Partial<AppSettings>): ServiceResult {
    return {
      ok: true,
      message: `Connected successfully with model ${patch.model ?? getSettings().model}.`
    };
  }

  installIpcHandlers(deps: E2eHarnessDeps) {
    ipcMain.handle("e2e:getState", (): E2eState => {
      return {
        workflowState: deps.getWorkflowState(),
        windowCount: BrowserWindow.getAllWindows().length,
        historyCount: listHistory().length,
        settings: getSettings(),
        history: listHistory()
      };
    });

    ipcMain.handle("e2e:resetState", async () => {
      deps.closeCaptureWindows();
      deps.closeResultWindow();
      deps.setWorkflowState("idle");
      this.mockCaptureOptions = { ...defaultMockCaptureOptions };
      await clearHistory();
      resetHistoryForTests();
      resetSettingsForTests();
      await updateSettings(defaultSettings);
      return true;
    });

    ipcMain.handle("e2e:mockCaptureSubmit", async (_event, options?: E2eMockCaptureOptions) => {
      this.mockCaptureOptions = {
        ocrText: options?.ocrText ?? defaultMockCaptureOptions.ocrText,
        translatedText: options?.translatedText ?? defaultMockCaptureOptions.translatedText,
        translationError: options?.translationError ?? defaultMockCaptureOptions.translationError
      };

      deps.setWorkflowState("processing", "Running mock capture");
      await deps.processCaptureResult(createE2eImageDataUrl(), {
        x: 80,
        y: 80,
        width: 360,
        height: 180
      });
      return listHistory()[0] ?? null;
    });
  }
}

function createE2eImageDataUrl(): string {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180"><rect width="360" height="180" fill="#f8fafc"/><text x="40" y="96" font-family="Arial" font-size="28" fill="#0f172a">${randomUUID()}</text></svg>`
  );
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}
