import { useTransferStore, formatTransferSize } from "../store/transferStore";
import { t } from "../lib/i18n";
import {
  Play,
  Pause,
  X,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Upload,
  Download,
} from "lucide-react";
import type { TransferTaskStatus } from "../store/transferStore";

interface TransferQueuePanelProps {
  open?: boolean;
  onToggle?: () => void;
  lang?: string;
}

function StatusBadge({ status }: { status: TransferTaskStatus }) {
  const styles: Record<TransferTaskStatus, string> = {
    queued: "bg-gray-600 text-gray-200",
    transferring: "bg-blue-600 text-white",
    paused: "bg-yellow-600 text-white",
    completed: "bg-green-700 text-green-100",
    failed: "bg-red-700 text-red-100",
    cancelled: "bg-gray-700 text-gray-400",
  };
  const labels: Record<TransferTaskStatus, string> = {
    queued: "Queued",
    transferring: "...",
    paused: "Paused",
    completed: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ProgressBar({ transferred, total }: { transferred: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-[var(--color-gray-800)] overflow-hidden">
      <div
        className="h-full rounded-full bg-blue-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TransferQueuePanel({ open = false, onToggle, lang }: TransferQueuePanelProps) {
  const lang_ = lang ?? "zh-CN";
  const tasks = useTransferStore((s) => s.tasks);
  const pauseAll = useTransferStore((s) => s.pauseAll);
  const resumeAll = useTransferStore((s) => s.resumeAll);
  const clearCompleted = useTransferStore((s) => s.clearCompleted);
  const pauseTask = useTransferStore((s) => s.pauseTask);
  const resumeTask = useTransferStore((s) => s.resumeTask);
  const cancelTask = useTransferStore((s) => s.cancelTask);
  const retryTask = useTransferStore((s) => s.retryTask);

  const hasTasks = tasks.length > 0;
  const activeCount = tasks.filter(
    (t) => t.status === "transferring" || t.status === "queued" || t.status === "paused",
  ).length;

  if (!hasTasks) return null;

  return (
    <div className="border-t border-[var(--color-gray-800)] bg-[var(--color-gray-950)]">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--color-gray-300)] hover:bg-[var(--color-gray-900)]"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          <span>{t(lang_, "transferQueue")} ({activeCount})</span>
        </span>
      </button>

      {/* Body */}
      {open ? (
        <div className="max-h-48 overflow-auto">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-gray-800)]">
            <button
              onClick={pauseAll}
              disabled={activeCount === 0}
              title={t(lang_, "transferPauseAll")}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--color-gray-800)] hover:bg-[var(--color-gray-700)] disabled:opacity-50"
            >
              <Pause className="size-3" />
            </button>
            <button
              onClick={resumeAll}
              title={t(lang_, "transferResumeAll")}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--color-gray-800)] hover:bg-[var(--color-gray-700)]"
            >
              <Play className="size-3" />
            </button>
            <button
              onClick={clearCompleted}
              title={t(lang_, "transferClearCompleted")}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--color-gray-800)] hover:bg-[var(--color-gray-700)]"
            >
              <Trash2 className="size-3" />
            </button>
          </div>

          {/* Task list */}
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-center gap-2 px-3 py-2 border-b border-[var(--color-gray-850)] ${
                task.status === "transferring" ? "bg-[var(--color-gray-900)]" : ""
              }`}
            >
              {/* Direction icon */}
              {task.direction === "upload" ? (
                <Upload className="size-3.5 text-green-400 flex-shrink-0" />
              ) : (
                <Download className="size-3.5 text-blue-400 flex-shrink-0" />
              )}

              {/* File info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] truncate text-[var(--color-gray-200)]">{task.fileName}</span>
                  <StatusBadge status={task.status} />
                </div>
                <ProgressBar transferred={task.transferred} total={task.size} />
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-[var(--color-gray-500)] tabular-nums">
                    {formatTransferSize(task.transferred)} / {formatTransferSize(task.size)}
                  </span>
                  {task.speed > 0 && task.status === "transferring" ? (
                    <span className="text-[10px] text-[var(--color-gray-500)] tabular-nums">
                      {formatTransferSize(task.speed)}/s
                    </span>
                  ) : null}
                </div>
                {task.error ? (
                  <div className="text-[10px] text-red-400 mt-0.5">{task.error}</div>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {(task.status === "transferring" || task.status === "queued") && (
                  <button
                    onClick={() => pauseTask(task.id)}
                    className="text-[var(--color-gray-500)] hover:text-white p-0.5"
                    title={t(lang_, "transferPause")}
                  >
                    <Pause className="size-3" />
                  </button>
                )}
                {task.status === "paused" && (
                  <button
                    onClick={() => resumeTask(task.id)}
                    className="text-[var(--color-gray-500)] hover:text-white p-0.5"
                    title={t(lang_, "transferResume")}
                  >
                    <Play className="size-3" />
                  </button>
                )}
                {(task.status === "failed" || task.status === "cancelled") && (
                  <button
                    onClick={() => retryTask(task.id)}
                    className="text-[var(--color-gray-500)] hover:text-white p-0.5"
                    title={t(lang_, "transferRetry")}
                  >
                    <RotateCcw className="size-3" />
                  </button>
                )}
                {task.status !== "completed" && task.status !== "cancelled" && (
                  <button
                    onClick={() => cancelTask(task.id)}
                    className="text-[var(--color-gray-500)] hover:text-red-400 p-0.5"
                    title={t(lang_, "cancel")}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
