import { shell } from "electron";

const allowedExternalProtocols = new Set(["https:", "mailto:"]);

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return allowedExternalProtocols.has(url.protocol);
  } catch {
    return false;
  }
}

export function openAllowedExternalUrl(value: string): void {
  if (isAllowedExternalUrl(value)) {
    void shell.openExternal(value);
  }
}
