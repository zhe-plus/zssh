import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";
import { type PasteCheckResult } from "../lib/pasteProtection";
import { t } from "../lib/i18n";

export interface PasteConfirmDialogProps {
  result: PasteCheckResult;
  lang?: string;
  onExecute: (content: string) => void;
  onCancel: () => void;
}

export function PasteConfirmDialog({ result, lang, onExecute, onCancel }: PasteConfirmDialogProps) {
  const lines = useMemo(() => result.preview.split("\n"), [result.preview]);
  const isDangerous = result.dangerousLines.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-[520px] bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-gray-700)]">
          {isDangerous ? (
            <AlertTriangle className="size-5 text-red-400 shrink-0" />
          ) : (
            <CheckCircle className="size-5 text-yellow-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-white">
            {isDangerous ? t(lang, "pasteWarningTitle") : t(lang, "pasteConfirmTitle")}
          </span>
          <div className="flex-1" />
          <button onClick={onCancel} className="p-1 rounded hover:bg-[var(--color-gray-800)] text-[var(--color-gray-400)]">
            <X className="size-4" />
          </button>
        </div>

        {/* Info bar */}
        <div className="px-4 py-2 bg-[var(--color-gray-800)] flex items-center gap-3 text-xs">
          <span className={["px-1.5 py-0.5 rounded", isDangerous ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"].join(" ")}>
            {result.lineCount} {t(lang, "pasteLineCount")}
          </span>
          {isDangerous && (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
              {result.dangerousLines.length} {t(lang, "pasteDangerCount")}
            </span>
          )}
          {!isDangerous && result.isMultiLine && (
            <span className="text-[var(--color-gray-400)]">{t(lang, "pasteMultiLineHint")}</span>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto max-h-[280px] px-4 py-2">
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
            {lines.map((line, i) => {
              const lineNum = i + 1;
              const isDanger = result.dangerousLines.includes(lineNum);
              return (
                <div key={i} className={["py-0.5 px-1 rounded", isDanger ? "bg-red-500/10" : ""].join(" ")}>
                  <span className="inline-block w-6 text-right mr-3 select-none text-[var(--color-gray-600)] shrink-0">{lineNum}</span>
                  <code className={[isDanger ? "text-red-300 font-semibold" : "text-[var(--color-gray-200)]"].join(" ")}>{escapeHtml(line)}</code>
                </div>
              );
            })}
          </pre>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-gray-800)]">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)] transition-colors"
          >
            {t(lang, "cancel")}
          </button>
          <button
            onClick={() => onExecute(result.preview)}
            className={[
              "px-3 py-1.5 rounded text-sm transition-colors",
              isDangerous
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700",
            ].join(" ")}
          >
            {t(lang, "pasteExecute")}
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
