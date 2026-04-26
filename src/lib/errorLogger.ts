/**
 * Error Logger - Persistent error logging with reporting support
 * Stores errors to localStorage for later review/export
 */

export interface LoggedError {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  componentStack?: string;
  userAgent: string;
  appVersion: string;
}

const STORAGE_KEY = "zssh:error_log";
const MAX_ERRORS = 50;

function getStoredErrors(): LoggedError[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storeErrors(errors: LoggedError[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(errors.slice(-MAX_ERRORS)));
  } catch {
    // Storage unavailable
  }
}

/**
 * Log an error to persistent storage
 */
export function logError(error: Error, errorInfo?: React.ErrorInfo): LoggedError {
  const entry: LoggedError = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    message: error.message,
    stack: error.stack ?? undefined,
    componentStack: errorInfo?.componentStack ?? undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    appVersion: typeof globalThis !== "undefined" && "__APP_VERSION__" in (globalThis as any)
      ? (globalThis as any).__APP_VERSION__ as string
      : "0.1.0",
  };

  const errors = getStoredErrors();
  errors.push(entry);
  storeErrors(errors);

  // Also output to console for development
  console.error("[ZSSH ErrorBoundary]", entry);

  return entry;
}

/**
 * Get all logged errors (newest first)
 */
export function getLoggedErrors(): LoggedError[] {
  return getStoredErrors().reverse();
}

/**
 * Clear all logged errors
 */
export function clearLoggedErrors(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Get error count since last clear
 */
export function getErrorCount(): number {
  return getStoredErrors().length;
}

/**
 * Generate a report text from an error (for user to copy/paste)
 */
export function generateReportText(error: LoggedError): string {
  const lines = [
    `ZSSH Error Report`,
    `==================`,
    ``,
    `Timestamp: ${new Date(error.timestamp).toISOString()}`,
    `Message: ${error.message}`,
    `App Version: ${error.appVersion}`,
    `User Agent: ${error.userAgent}`,
  ];

  if (error.stack) {
    lines.push("", `Stack Trace:`, "```", error.stack, "```");
  }

  if (error.componentStack) {
    lines.push("", `Component Stack:`, "```", error.componentStack, "```");
  }

  lines.push(
    "",
    "---",
    "Please include this information when reporting issues at:",
    "https://github.com/your-repo/zssh/issues"
  );

  return lines.join("\n");
}
