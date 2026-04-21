import { randomUUID } from "node:crypto";
import type { HistoryItem, HistoryStatus } from "../../shared/types";
import { readJsonFile, writeJsonFile } from "./store";

const HISTORY_FILE = "history.json";
const HISTORY_LIMIT = 50;

let cachedHistory: HistoryItem[] | null = null;

function getHistoryState() {
  if (!cachedHistory) {
    cachedHistory = readJsonFile<HistoryItem[]>(HISTORY_FILE, []);
  }

  return cachedHistory;
}

function saveHistory(next: HistoryItem[]) {
  cachedHistory = next.slice(0, HISTORY_LIMIT);
  writeJsonFile(HISTORY_FILE, cachedHistory);
}

export function listHistory() {
  return getHistoryState();
}

export function getHistoryItem(id: string) {
  return getHistoryState().find((item) => item.id === id) ?? null;
}

export function clearHistory() {
  saveHistory([]);
}

export function createHistoryItem(targetLanguage: string): HistoryItem {
  const now = new Date().toISOString();
  const item: HistoryItem = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    sourceText: "",
    translatedText: "",
    sourceLanguage: "auto",
    targetLanguage,
    status: "pending"
  };

  saveHistory([item, ...getHistoryState()]);
  return item;
}

export function updateHistoryItem(
  id: string,
  patch: Partial<Omit<HistoryItem, "id" | "createdAt">> & {
    status?: HistoryStatus;
  }
) {
  const next = getHistoryState().map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      ...patch,
      updatedAt: new Date().toISOString()
    };
  });

  saveHistory(next);
  return getHistoryItem(id);
}

