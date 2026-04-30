import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export type TransferStatus = "idle" | "waiting" | "transferring" | "complete" | "failed";

interface TransferProgressProps {
  fileName: string;
  status: TransferStatus;
  progress?: number; // 0-100
  speed?: string; // e.g. "1.2 MB/s"
  lang?: string;
}

export function TransferProgress({ fileName, status, progress = 0, speed, lang }: TransferProgressProps) {
  const lang_ = lang ?? "zh-CN";
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (status === "complete") {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (!visible && status !== "failed") return null;

  const statusIcon = {
    idle: null,
    waiting: <Loader2 className="size-3.5 animate-spin text-yellow-400" />,
    transferring: <Loader2 className="size-3.5 animate-spin text-blue-400" />,
    complete: <CheckCircle className="size-3.5 text-green-400" />,
    failed: <AlertCircle className="size-3.5 text-red-400" />,
  };

  const statusText = {
    idle: "",
    waiting: t(lang_, "transferWaiting") || "等待中...",
    transferring: t(lang_, "transferring"),
    complete: t(lang_, "transferComplete"),
    failed: t(lang_, "transferFailed"),
  };

  const barColor =
    status === "failed"
      ? "bg-red-500"
      : status === "complete"
        ? "bg-green-500"
        : "bg-blue-500";

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-gray-900)] border-t border-[var(--color-gray-800)] text-xs">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {statusIcon[status]}
        <span className="truncate text-[var(--color-gray-200)]">{fileName}</span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {status === "transferring" && (
          <>
            <span className="text-[var(--color-gray-400)] tabular-nums w-10 text-right">
              {progress}%
            </span>
            <div className="w-24 h-1.5 rounded-full bg-[var(--color-gray-800)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            {speed ? (
              <span className="text-[var(--color-gray-500)] tabular-nums w-16 text-right">{speed}</span>
            ) : (
              <span className="w-16" />
            )}
          </>
        )}

        {(status === "complete" || status === "failed") && (
          <span
            className={
              status === "complete"
                ? "text-green-400"
                : "text-red-400"
            }
          >
            {statusText[status]}
          </span>
        )}
      </div>

      {status === "transferring" || status === "failed" ? (
        <button
          onClick={() => setVisible(false)}
          className="flex-shrink-0 text-[var(--color-gray-500)] hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
