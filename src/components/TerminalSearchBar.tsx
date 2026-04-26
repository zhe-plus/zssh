import React, { useCallback, useEffect, useRef } from "react";
import { Search, ArrowUp, ArrowDown, X } from "lucide-react";
import type { SearchAddon } from "@xterm/addon-search";
import { t } from "../lib/i18n";

export interface TerminalSearchBarProps {
  searchAddon: SearchAddon | null;
  visible: boolean;
  onClose: () => void;
  lang?: string;
}

export function TerminalSearchBar({ searchAddon, visible, onClose, lang }: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [visible]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          searchAddon?.findPrevious(inputRef.current?.value ?? "", { regex: false, caseSensitive: false, wholeWord: false });
        } else {
          searchAddon?.findNext(inputRef.current?.value ?? "", { regex: false, caseSensitive: false, wholeWord: false });
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [searchAddon, onClose],
  );

  const handleFindNext = useCallback(() => {
    searchAddon?.findNext(inputRef.current?.value ?? "", { regex: false, caseSensitive: false, wholeWord: false });
  }, [searchAddon]);

  const handleFindPrevious = useCallback(() => {
    searchAddon?.findPrevious(inputRef.current?.value ?? "", { regex: false, caseSensitive: false, wholeWord: false });
  }, [searchAddon]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-gray-800)] border-b border-[var(--color-gray-700)] z-10 shrink-0">
      <Search className="size-3.5 text-[var(--color-gray-400)] shrink-0" />
      <input
        ref={inputRef}
        type="text"
        placeholder={t(lang, "terminalSearchPlaceholder")}
        className="h-6 flex-1 min-w-0 px-1.5 rounded text-xs bg-[var(--color-gray-900)] border border-[var(--color-gray-600)] text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-[var(--color-blue-500)]"
        onKeyDown={handleKeyDown}
      />
      <button
        onClick={handleFindPrevious}
        className="p-0.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-300)]"
        title="上一个 (Shift+Enter)"
      >
        <ArrowUp className="size-3" />
      </button>
      <button
        onClick={handleFindNext}
        className="p-0.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-300)]"
        title="下一个 (Enter)"
      >
        <ArrowDown className="size-3" />
      </button>
      <button
        onClick={onClose}
        className="p-0.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-400)]"
        title="关闭 (Esc)"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
