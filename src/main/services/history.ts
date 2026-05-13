import { randomUUID } from "node:crypto";
import type { HistoryItem, HistoryStatus } from "../../shared/types";
import { readJsonFile, writeJsonFileAtomic } from "./store";

const HISTORY_FILE = "history.json";
const HISTORY_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 100;

let cachedHistory: HistoryItem[] | null = null;
let pendingSnapshot: HistoryItem[] | null = null;
let saveTimer: NodeJS.Timeout | null = null;

function getHistoryState() {
  if (!cachedHistory) {
    cachedHistory = readJsonFile<HistoryItem[]>(HISTORY_FILE, []);
  }

  return cachedHistory;
}

async function persist(snapshot: HistoryItem[]): Promise<void> {
  try {
    await writeJsonFileAtomic(HISTORY_FILE, snapshot);
  } catch (error) {
    console.error("Failed to persist history.", error);
  }
}

function scheduleSave(snapshot: HistoryItem[]) {
  pendingSnapshot = snapshot;

  if (saveTimer) {
    return;
  }

  saveTimer = setTimeout(() => {
    const next = pendingSnapshot;
    pendingSnapshot = null;
    saveTimer = null;
    if (next) {
      void persist(next);
    }
  }, SAVE_DEBOUNCE_MS);
}

function saveHistory(next: HistoryItem[]) {
  cachedHistory = next.slice(0, HISTORY_LIMIT);
  scheduleSave(cachedHistory);
}

/**
 * Forces any pending debounced write to flush immediately. Call before quit
 * or after destructive operations where readers must see the new state on
 * disk synchronously.
 */
export async function flushHistory(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (pendingSnapshot) {
    const next = pendingSnapshot;
    pendingSnapshot = null;
    await persist(next);
  }
}

export function listHistory() {
  return getHistoryState();
}

export function getHistoryItem(id: string) {
  return getHistoryState().find((item) => item.id === id) ?? null;
}

export async function clearHistory(): Promise<void> {
  saveHistory([]);
  await flushHistory();
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

