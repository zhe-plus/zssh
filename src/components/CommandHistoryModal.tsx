import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { searchHistory, clearHistory, type CommandEntry } from "../lib/commandHistory";
import { t } from "../lib/i18n";

export interface CommandHistoryModalProps {
  open: boolean;
  lang?: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function CommandHistoryModal({ open, lang, onSelect, onClose }: CommandHistoryModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(searchHistory("", 100));
      setActiveIdx(0);
      // Focus input after a tick so modal animation completes
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setResults(searchHistory(query, 100));
      setActiveIdx(0);
    }, 80); // slight debounce
    return () => clearTimeout(t);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[activeIdx]) {
        e.preventDefault();
        onSelect(results[activeIdx]!.command);
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [results, activeIdx, onSelect, onClose],
  );

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  const handleClear = useCallback(() => {
    clearHistory();
    setResults([]);
    setQuery("");
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[520px] max-h-[60vh] bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-gray-700)]">
          <Search className="size-4 text-[var(--color-gray-400)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-[var(--color-gray-500)] outline-none"
            placeholder={`${t(lang, "terminalSearchPlaceholder")} (${t(lang, "commandHistoryTitle").toLowerCase()})`}
          />
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-[var(--color-gray-800)] text-[var(--color-gray-400)] hover:text-red-400 shrink-0"
            title={t(lang, "clearHistory")}
          >
            <Trash2 className="size-3.5" />
          </button>
          <span className="text-[10px] text-[var(--color-gray-500)] tabular-nums">{results.length}</span>
        </div>

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-gray-500)]">
              {t(lang, "commandPaletteNoResults")}
            </div>
          ) : (
            results.map((entry, i) => (
              <button
                key={entry.id}
                onClick={() => {
                  onSelect(entry.command);
                  onClose();
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={[
                  "w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors",
                  i === activeIdx
                    ? "bg-[var(--color-blue-600)]/20 text-white"
                    : "text-[var(--color-gray-300)] hover:bg-[var(--color-gray-800)]",
                ].join(" ")}
              >
                <code
                  className={[
                    "flex-1 font-mono text-xs truncate",
                    i === activeIdx ? "text-white" : "text-[var(--color-gray-200)]",
                  ].join(" ")}
                  dangerouslySetInnerHTML={{ __html: highlightQuery(entry.command, query) }}
                />
                <span className="shrink-0 text-[10px] text-[var(--color-gray-600)] tabular-nums">
                  {formatTime(entry.timestamp)}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-[var(--color-gray-800)] flex gap-3 text-[10px] text-[var(--color-gray-500)]">
          <span>↑↓ Navigate</span>
          <span>Enter Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

/** Highlight matching parts of command text */
function highlightQuery(text: string, q: string): string {
  if (!q.trim()) return escapeHtml(text);
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return text.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="bg-yellow-500/30 text-yellow-300 rounded px-0.5">$1</mark>');
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
