import { useState, useEffect, useRef } from "react";
import { FileEdit, X } from "lucide-react";
import { t } from "../lib/i18n";

export interface SftpRenameDialogProps {
  open: boolean;
  originalName: string;
  lang?: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export function SftpRenameDialog({
  open,
  originalName,
  lang,
  onConfirm,
  onCancel,
}: SftpRenameDialogProps) {
  const [value, setValue] = useState(originalName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(originalName);
      // Focus and select all after opening
      setTimeout(() => {
        inputRef.current?.select();
      }, 50);
    }
  }, [open, originalName]);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== originalName) {
      onConfirm(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  if (!open) return null;

  const hasExtension = originalName.includes(".");
  const extension = hasExtension ? originalName.slice(originalName.lastIndexOf(".")) : "";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="w-[400px] bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-gray-800)]">
          <FileEdit className="size-5 text-blue-400 shrink-0" />
          <span className="text-sm font-medium text-white">{t(lang, "rename")}</span>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="p-1 rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-4 py-4">
          <label className="block text-xs text-[var(--color-gray-400)] mb-2">
            {t(lang, "sftpPromptRenameTo")}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 rounded bg-[var(--color-gray-950)] border border-[var(--color-gray-700)] text-sm text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-blue-500 transition-colors"
            autoFocus
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[var(--color-gray-500)]">{t(lang, "sftpOriginalName")}:</span>
            <span className="text-xs text-[var(--color-gray-400)] font-mono truncate">{originalName}</span>
          </div>
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
            onClick={handleConfirm}
            disabled={!value.trim() || value.trim() === originalName}
            className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t(lang, "confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
