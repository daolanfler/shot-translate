import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent, CaptureSubmitPayload, WindowContext } from "../shared/types";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: vi.fn()
  },
  clipboard: {
    writeText: vi.fn()
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    })
  }
}));

vi.mock("./services/settings", () => ({
  getSettings: vi.fn()
}));

vi.mock("./services/history", () => ({
  clearHistory: vi.fn(),
  deleteHistoryItem: vi.fn(),
  getHistoryItem: vi.fn(),
  listHistory: vi.fn()
}));

vi.mock("./services/translator", () => ({
  testTranslationConnection: vi.fn()
}));

vi.mock("./services/logger", () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn()
  }
}));

function createDeps(overrides: Partial<Parameters<typeof import("./ipcHandlers").installIpcHandlers>[0]> = {}) {
  return {
    e2eHarness: null,
    broadcast: vi.fn((_event: AppEvent) => undefined),
    getContextForSender: vi.fn((_senderId: number): WindowContext => ({ type: "capture", displayId: 7 })),
    getResultWindow: vi.fn(() => null),
    requireUpdateService: vi.fn(),
    updateSettingsSafely: vi.fn(),
    getCaptureSource: vi.fn(),
    startCaptureFlow: vi.fn(),
    cropCaptureSelection: vi.fn(),
    closeCaptureWindows: vi.fn(),
    moveResultWindow: vi.fn(),
    retryHistoryItem: vi.fn(),
    setQuitting: vi.fn(),
    getWorkflowState: vi.fn(() => "capturing" as const),
    setWorkflowState: vi.fn(),
    closeResultWindow: vi.fn(),
    processCaptureResult: vi.fn(),
    ...overrides
  };
}

describe("installIpcHandlers", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it("closes capture windows and resets workflow when main-side crop fails", async () => {
    const { installIpcHandlers } = await import("./ipcHandlers");
    const deps = createDeps({
      cropCaptureSelection: vi.fn(async () => {
        throw new Error("crop failed");
      })
    });

    installIpcHandlers(deps);
    const submit = handlers.get("capture:submit");
    if (!submit) {
      throw new Error("capture:submit was not registered.");
    }

    const payload: CaptureSubmitPayload = {
      displayId: 7,
      selectionRect: { x: 10, y: 20, width: 30, height: 40 }
    };
    const result = await submit({ sender: { id: 123 } }, payload);

    expect(result).toBe(false);
    expect(deps.cropCaptureSelection).toHaveBeenCalledWith(payload);
    expect(deps.closeCaptureWindows).toHaveBeenCalledTimes(1);
    expect(deps.setWorkflowState).toHaveBeenCalledWith("idle");
    expect(deps.processCaptureResult).not.toHaveBeenCalled();
  });
});
