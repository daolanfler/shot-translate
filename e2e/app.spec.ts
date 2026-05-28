import { test, expect } from "./fixtures";

test("launches the main window and shows update state", async ({ mainWindow }) => {
  await expect(mainWindow.getByText("Shot Translate")).toBeVisible();
  await expect(mainWindow.getByTestId("nav-settings")).toBeVisible();
  await expect(mainWindow.getByTestId("nav-history")).toBeVisible();
  await expect(mainWindow.getByTestId("nav-updates")).toBeVisible();

  await mainWindow.getByTestId("nav-updates").click();
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

  await mainWindow.getByTestId("nav-history").click();
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
  await expect(mainWindow.getByText("Mock translation failed")).toBeVisible();
});
