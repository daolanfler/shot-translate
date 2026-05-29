import { describe, expect, it, vi } from "vitest";

const { getPath, writePaths, writeFile, rename } = vi.hoisted(() => ({
  getPath: vi.fn(() => "C:\\userData"),
  writePaths: [] as string[],
  writeFile: vi.fn(async (filePath: string) => {
    writePaths.push(filePath);
  }),
  rename: vi.fn(async () => undefined)
}));

vi.mock("electron", () => ({
  app: {
    getPath
  }
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    promises: {
      writeFile,
      rename
    }
  }
}));

describe("writeJsonFile", () => {
  it("uses a unique temporary file for each write", async () => {
    const { writeJsonFile } = await import("./store");

    await Promise.all([
      writeJsonFile("settings.json", { value: 1 }),
      writeJsonFile("settings.json", { value: 2 })
    ]);

    expect(writePaths).toHaveLength(2);
    expect(new Set(writePaths).size).toBe(2);
    expect(rename).toHaveBeenCalledTimes(2);
  });
});
