import { test, expect } from "./fixtures";
import type { ElectronApplication, Page } from "@playwright/test";

async function waitForResultPage(electronApp: ElectronApplication): Promise<Page> {
  let resultPage: Page | undefined;

  await expect
    .poll(() => {
      resultPage = electronApp.windows().find((page) => page.url().includes("#/result"));
      return Boolean(resultPage);
    })
    .toBe(true);

  return resultPage!;
}

test("launches the main window and shows update state", async ({ mainWindow }) => {
  await expect(mainWindow.getByText("Shot Translate")).toBeVisible();
  await expect(mainWindow).toHaveURL(/#\/settings$/);
  await expect(mainWindow.getByTestId("nav-settings")).toBeVisible();
  await expect(mainWindow.getByTestId("nav-history")).toBeVisible();
  await expect(mainWindow.getByTestId("nav-updates")).toBeVisible();

  await mainWindow.getByTestId("nav-updates").click();
  await expect(mainWindow).toHaveURL(/#\/updates$/);
  await expect(mainWindow.getByText("Development mode", { exact: true })).toBeVisible();
});

test("saves settings and tests the API connection with mocks", async ({ mainWindow }) => {
  await mainWindow.getByLabel("Global shortcut").fill("Alt+Shift+S");
  await mainWindow.getByLabel("Global shortcut").blur();
  await expect(mainWindow.getByText("Settings saved.")).toBeVisible();

  await mainWindow.getByLabel("API base URL").fill("https://example.test/v1");
  await mainWindow.getByLabel("API base URL").blur();
  await mainWindow.getByLabel("Model").fill("mock-model");
  await mainWindow.getByLabel("Model").blur();
  await mainWindow.getByLabel("API key").fill("test-key");
  await mainWindow.getByLabel("API key").blur();

  await mainWindow.getByRole("button", { name: "Test connection" }).click();
  await expect(mainWindow.getByText("Connected successfully with model mock-model.").first()).toBeVisible();

  const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
  expect(state.settings.shortcut).toBe("Alt+Shift+S");
  expect(state.settings.apiBaseUrl).toBe("https://example.test/v1");
  expect(state.settings.model).toBe("mock-model");
});

test("runs a mocked capture translation flow and manages history", async ({ mainWindow, electronApp }) => {
  await mainWindow.evaluate(() =>
    window.shotTranslate.e2e!.mockCaptureSubmit({
      ocrText: "Hello world",
      translatedText: "你好，世界"
    })
  );

  await expect.poll(async () => {
    const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
    return state.history[0]?.status;
  }).toBe("success");

  await expect.poll(() => electronApp.windows().length).toBeGreaterThan(1);
  const resultPage = await waitForResultPage(electronApp);
  await expect(resultPage.getByText("你好，世界")).toBeVisible();

  const resultWindowHandle = await electronApp.browserWindow(resultPage);
  await expect.poll(() => resultWindowHandle.evaluate((window) => window.isResizable())).toBe(true);

  const initialBounds = await resultWindowHandle.evaluate((window) => window.getBounds());
  await resultWindowHandle.evaluate((window) => {
    const bounds = window.getBounds();
    window.setBounds({ ...bounds, width: 620, height: 460 });
  });
  await expect.poll(() => resultWindowHandle.evaluate((window) => window.getBounds().width)).toBe(620);
  await expect.poll(() => resultWindowHandle.evaluate((window) => window.getBounds().height)).toBe(460);

  const headerBox = await resultPage.locator("header").boundingBox();
  expect(headerBox).not.toBeNull();
  await resultPage.mouse.move(headerBox!.x + 120, headerBox!.y + 20);
  await resultPage.mouse.down();
  await resultPage.mouse.move(headerBox!.x + 240, headerBox!.y + 80, { steps: 6 });
  await resultPage.mouse.up();

  await expect
    .poll(async () => {
      const nextBounds = await resultWindowHandle.evaluate((window) => window.getBounds());
      return nextBounds.x !== initialBounds.x || nextBounds.y !== initialBounds.y;
    })
    .toBe(true);

  await resultPage.evaluate(() => window.shotTranslate.moveResultWindow({ deltaX: -100000, deltaY: -100000 }));
  const clampedBounds = await resultWindowHandle.evaluate((window) => window.getBounds());
  const clampedWorkArea = await electronApp.evaluate(({ BrowserWindow, screen }, windowId) => {
    const window = BrowserWindow.fromId(windowId);
    if (!window) {
      throw new Error("Result window was not found.");
    }

    return screen.getDisplayMatching(window.getBounds()).workArea;
  }, await resultWindowHandle.evaluate((window) => window.id));
  expect(clampedBounds.x).toBeGreaterThanOrEqual(clampedWorkArea.x);
  expect(clampedBounds.y).toBeGreaterThanOrEqual(clampedWorkArea.y);

  await mainWindow.getByTestId("nav-history").click();
  await expect(mainWindow).toHaveURL(/#\/history$/);
  await expect(mainWindow.getByText("Hello world")).toBeVisible();
  await expect(mainWindow.getByText("你好，世界")).toBeVisible();

  await mainWindow.getByRole("button", { name: "Retry" }).click();
  await expect.poll(async () => {
    const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
    return state.history[0]?.status;
  }).toBe("success");

  await mainWindow.getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => {
    const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
    return state.historyCount;
  }).toBe(0);
});

test("shows OCR and translation failure states with mocks", async ({ mainWindow }) => {
  await mainWindow.evaluate(() =>
    window.shotTranslate.e2e!.mockCaptureSubmit({
      ocrText: ""
    })
  );

  await expect.poll(async () => {
    const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
    return state.history[0]?.status;
  }).toBe("ocr_failed");

  await mainWindow.evaluate(() => window.shotTranslate.e2e!.resetState());
  await mainWindow.evaluate(() =>
    window.shotTranslate.e2e!.mockCaptureSubmit({
      ocrText: "Hello world",
      translationError: "Mock translation failed"
    })
  );

  await expect.poll(async () => {
    const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
    return state.history[0]?.status;
  }).toBe("error");

  await mainWindow.getByTestId("nav-history").click();
  await expect(mainWindow).toHaveURL(/#\/history$/);
  await expect(mainWindow.getByText("Mock translation failed")).toBeVisible();
});

test("marks low-confidence OCR and allows source correction", async ({ mainWindow, electronApp }) => {
  await mainWindow.evaluate(() =>
    window.shotTranslate.e2e!.mockCaptureSubmit({
      ocrText: "H3llo wor1d",
      ocrConfidence: 42,
      translatedText: "你好，世界"
    })
  );

  await expect.poll(async () => {
    const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
    return state.history[0]?.status;
  }).toBe("low_confidence");

  const resultPage = await waitForResultPage(electronApp);
  await expect(resultPage.getByText("OCR 置信度低，请核对原文")).toBeVisible();
  await expect(resultPage.getByText("OCR 42%")).toBeVisible();

  await resultPage.getByRole("button", { name: "编辑原文" }).click();
  await resultPage.getByPlaceholder("暂无原文").fill("Hello world");
  await resultPage.getByRole("button", { name: "重新翻译" }).click();

  await expect.poll(async () => {
    const state = await mainWindow.evaluate(() => window.shotTranslate.e2e!.getState());
    return state.history[0]?.status;
  }).toBe("success");

  await mainWindow.getByTestId("nav-history").click();
  await expect(mainWindow.getByText("OCR confidence")).toHaveCount(0);
  await expect(mainWindow.getByText("Hello world")).toBeVisible();
});
