/** Dangerous command patterns that should trigger a warning */
export const DANGEROUS_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\s+[/~]/,
  /\brm\s+[-a-zA-Z]*rf\s/,
  /\bmkfs\b/,
  /\bdd\s+if=.*of=\/dev\/[sh]d\b/,
  />\s*\/dev\/sd[a-z]\b/,
  /:\s*q!\s*$/,
  /shutdown\b/,
  /reboot\b/,
  /init\s+[06]/,
  /systemctl\s+(poweroff|reboot|halt)/,
  /wipefs\b/,
  /badblocks\b.*-w\b/,
  /mv\s+.*\s*\/(dev|proc|sys)\//,
  /chmod\s+-R\s*777\s+[/~]/,
  />\s*\/etc\/(passwd|shadow|sudoers)/,
  /curl.*\|\s*(bash|sh)/,
  /wget.*\|\s*(bash|sh)/,
  /eval\s*\(/,
  /base64.*-d.*\|\s*bash/,
];

export interface PasteCheckResult {
  safe: boolean;
  isMultiLine: boolean;
  lineCount: number;
  dangerousLines: number[];
  preview: string;
}

/**
 * Check pasted content for potential dangers.
 * Returns safety analysis with dangerous line numbers and truncated preview.
 */
export function checkPaste(content: string, maxPreviewLen = 500): PasteCheckResult {
  if (!content) return { safe: true, isMultiLine: false, lineCount: 0, dangerousLines: [], preview: "" };

  const lines = content.split(/\r\n|\n|\r/);
  const lineCount = lines.length;
  const isMultiLine = lineCount >= 2;

  // Find dangerous lines (1-indexed)
  const dangerousLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmed)) {
        dangerousLines.push(i + 1);
        break; // Only count each line once
      }
    }
  }

  // Build preview (truncate long content)
  let preview = content;
  if (content.length > maxPreviewLen) {
    preview = content.slice(0, maxPreviewLen) + "\n... (truncated)";
  }

  // Safe if single-line AND not dangerous
  const safe = !isMultiLine && dangerousLines.length === 0;

  return { safe, isMultiLine, lineCount, dangerousLines, preview };
}
