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

/**
 * Atomically writes JSON: serializes to a sibling tmp file, then renames over
 * the target. Eliminates the "half-written file gets read" race that
 * `writeJsonFile` is vulnerable to under rapid concurrent writes.
 */
export async function writeJsonFileAtomic(name: string, value: unknown): Promise<void> {
  const filePath = path.join(app.getPath("userData"), name);
  ensureDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.promises.rename(tmpPath, filePath);
}
