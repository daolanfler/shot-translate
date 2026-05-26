import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryItem } from "../../shared/types";

const persisted: Record<string, unknown> = {};

vi.mock("./store", () => ({
  readJsonFile: vi.fn((name: string, fallback: unknown) => persisted[name] ?? fallback),
  writeJsonFile: vi.fn(async (name: string, value: unknown) => {
    persisted[name] = value;
  })
}));

describe("history service", () => {
  beforeEach(async () => {
    for (const key of Object.keys(persisted)) {
      delete persisted[key];
    }

    const history = await import("./history");
    history.resetHistoryForTests();
  });

  it("keeps only the 50 most recent items", async () => {
    const history = await import("./history");

    for (let i = 0; i < 55; i += 1) {
      history.createHistoryItem("en");
    }

    expect(history.listHistory()).toHaveLength(50);
  });

  it("deletes one item and persists the change", async () => {
    const history = await import("./history");
    const first = history.createHistoryItem("en");
    const second = history.createHistoryItem("zh-CN");

    await history.deleteHistoryItem(first.id);

    expect(history.getHistoryItem(first.id)).toBeNull();
    expect(history.getHistoryItem(second.id)).not.toBeNull();
    expect(persisted["history.json"]).toEqual([second]);
  });

  it("updates status and timestamp for one item", async () => {
    const history = await import("./history");
    const item = history.createHistoryItem("en");
    const updated = history.updateHistoryItem(item.id, {
      sourceText: "hello",
      translatedText: "你好",
      status: "success"
    });

    expect(updated).toMatchObject<Partial<HistoryItem>>({
      id: item.id,
      sourceText: "hello",
      translatedText: "你好",
      status: "success"
    });
    expect(updated?.updatedAt).toBeTruthy();
  });

  it("clears all history and persists an empty list", async () => {
    const history = await import("./history");
    history.createHistoryItem("en");

    await history.clearHistory();

    expect(history.listHistory()).toEqual([]);
    expect(persisted["history.json"]).toEqual([]);
  });
});
