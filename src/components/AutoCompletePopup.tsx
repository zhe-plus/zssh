import { useEffect, useRef, useState } from "react";
import type { CompletionItem } from "../lib/autoComplete";

interface AutoCompletePopupProps {
  items: CompletionItem[];
  selectedIndex: number;
  visible: boolean;
  onSelect: (item: CompletionItem) => void;
  onHighlight: (index: number) => void;
  onClose: () => void;
  lang?: string;
}

export function AutoCompletePopup({
  items,
  selectedIndex,
  visible,
  onSelect,
  onHighlight,
  onClose,
}: AutoCompletePopupProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [scrolling, setScrolling] = useState(false);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!listRef.current || !visible || scrolling) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | null;
    if (el?.scrollIntoView) {
      setScrolling(true);
      el.scrollIntoView({ block: "nearest" });
      setTimeout(() => setScrolling(false), 50);
    }
  }, [selectedIndex, visible]);

  if (!visible || items.length === 0) return null;

  const handleItemClick = (item: CompletionItem, _index: number) => {
    onSelect(item);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "command":
        return <span className="text-[9px] px-1 rounded bg-blue-900/50 text-blue-300 mr-1.5">CMD</span>;
      case "file":
        return <span className="text-[9px] px-1 rounded bg-green-900/50 text-green-300 mr-1.5">FILE</span>;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Backdrop to close on click */}
      <div
        className="fixed inset-0 z-[99]"
        onMouseDown={onClose}
      />

      {/* Popup */}
      <ul
        ref={listRef}
        className="absolute z-[100] w-full max-h-48 overflow-auto rounded border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] shadow-xl"
        style={{ bottom: "100%", marginBottom: 4 }}
        role="listbox"
      >
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <li
              key={`${item.text}-${index}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => handleItemClick(item, index)}
              onMouseEnter={() => onHighlight(index)}
              className={[
                "flex items-center gap-1 px-3 py-1.5 cursor-pointer text-xs transition-colors",
                isSelected
                  ? "bg-blue-600/30 text-white"
                  : "text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)]",
              ].join(" ")}
            >
              {getTypeIcon(item.type)}
              <span className="flex-1 truncate font-mono">{item.displayText ?? item.text}</span>
              {item.description && isSelected ? (
                <span className="text-[10px] text-[var(--color-gray-500)] ml-2 flex-shrink-0">
                  {item.description}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
