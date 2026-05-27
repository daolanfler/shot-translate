import fs from "node:fs/promises";
import path from "node:path";
import { test as base, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

interface Fixtures {
  electronApp: ElectronApplication;
  mainWindow: Page;
}

const userDataDir = path.resolve(process.cwd(), ".tmp/e2e-user-data");

export const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    await fs.rm(userDataDir, { force: true, recursive: true });

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    const app = await electron.launch({
      args: [path.resolve(process.cwd(), "out/main/index.js")],
      env: {
        ...env,
        SHOT_TRANSLATE_E2E: "1",
        SHOT_TRANSLATE_USER_DATA_DIR: userDataDir
      }
    });

    try {
      await use(app);
    } finally {
      await app.close();
      await fs.rm(userDataDir, { force: true, recursive: true });
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.evaluate(async () => {
      const api = window.shotTranslate.e2e;
      if (!api) {
        throw new Error("E2E API is not exposed.");
      }

      await api.resetState();
    });
    await use(window);
  }
});

export { expect } from "@playwright/test";
