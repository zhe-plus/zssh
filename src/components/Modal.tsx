import { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export function Modal(props: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={cn(
          "w-[760px] max-w-full max-h-[80vh] overflow-hidden",
          "bg-[var(--color-gray-900)] border border-[var(--color-gray-800)] rounded-lg shadow-xl",
          "flex flex-col",
        )}
      >
        <div className="h-11 px-4 border-b border-[var(--color-gray-800)] flex items-center gap-3">
          <div className="font-medium text-sm text-white truncate">{props.title}</div>
          <button
            className="ml-auto p-1 rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white"
            onClick={props.onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 overflow-auto">{props.children}</div>
        {props.footer ? <div className="p-4 border-t border-[var(--color-gray-800)]">{props.footer}</div> : null}
      </div>
    </div>
  );
}
