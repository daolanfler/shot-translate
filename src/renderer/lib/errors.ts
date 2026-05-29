export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown error.";
}

export function formatActionError(action: string, error: unknown): string {
  return `${action}: ${getErrorMessage(error)}`;
}
