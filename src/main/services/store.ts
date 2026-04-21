import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function readJsonFile<T>(name: string, fallback: T): T {
  const filePath = path.join(app.getPath("userData"), name);

  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(name: string, value: unknown) {
  const filePath = path.join(app.getPath("userData"), name);
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}
