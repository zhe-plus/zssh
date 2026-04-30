import { AlertTriangle, Trash2, X } from "lucide-react";
import { t, tf } from "../lib/i18n";

export interface SftpConfirmDialogProps {
  open: boolean;
  fileName?: string;
  title?: string;
  message?: string;
  lang?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SftpConfirmDialog({
  open,
  fileName,
  title,
  message,
  lang,
  onConfirm,
  onCancel,
}: SftpConfirmDialogProps) {
  if (!open) return null;

  const displayTitle = title ?? t(lang, "confirm");
  const displayMessage = message ?? (fileName ? tf(lang, "sftpConfirmDelete", { name: fileName }) : t(lang, "confirmDelete"));

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="w-[380px] bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-gray-800)]">
          <AlertTriangle className="size-5 text-red-400 shrink-0" />
          <span className="text-sm font-medium text-white truncate">{displayTitle}</span>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="p-1 rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Message */}
        <div className="px-4 py-4">
          <p className="text-sm text-[var(--color-gray-300)] leading-relaxed">
            {displayMessage}
          </p>
          {fileName && (
            <div className="mt-3 px-3 py-2 bg-[var(--color-gray-800)] rounded border border-[var(--color-gray-700)]">
              <span className="text-sm text-[var(--color-gray-200)] font-mono truncate block">{fileName}</span>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-gray-800)]">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)] transition-colors"
          >
            {t(lang, "cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded text-sm bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Trash2 className="size-4" />
            {t(lang, "delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
