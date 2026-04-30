import { useState, useEffect, useCallback } from "react";
import type { UUID } from "../types";
import { api } from "../api";
import { t, tf } from "../lib/i18n";
import { useTransferStore } from "../store/transferStore";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  X,
  RefreshCw,
  ArrowUpFromLine,
  ArrowDownToLine,
  ArrowLeftRight,
  FolderOpen,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";

export type SyncDirection = "upload" | "download" | "bidirectional";

export interface DiffItem {
  name: string;
  kind: "file" | "dir";
  localSize: number | null;
  remoteSize: number | null;
  localMtime: number | null;
  remoteMtime: number | null;
  status: "only_local" | "only_remote" | "different" | "same";
  checked: boolean;
}

interface FolderSyncDialogProps {
  open: boolean;
  ptyId: UUID | null;
  remoteCwd: string;
  onClose: () => void;
  lang?: string;
}

export function FolderSyncDialog({ open, ptyId, remoteCwd, onClose, lang }: FolderSyncDialogProps) {
  const lang_ = lang ?? "zh-CN";
  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState(remoteCwd);
  const [direction, setDirection] = useState<SyncDirection>("upload");
  const [exclusions, setExclusions] = useState("*.log,.git,node_modules,dist,.DS_Store,__pycache__,*.pyc");
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse exclusion patterns into array
  const getExclusionPatterns = useCallback((): string[] => {
    return exclusions
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }, [exclusions]);

  // Check if a filename matches any exclusion pattern
  const isExcluded = useCallback(
    (name: string): boolean => {
      const patterns = getExclusionPatterns();
      const lowerName = name.toLowerCase();
      return patterns.some((pattern) => {
        if (pattern.startsWith("*.")) {
          return lowerName.endsWith(pattern.slice(1));
        }
        if (pattern.endsWith("/")) {
          return lowerName === pattern.slice(0, -1) || lowerName.startsWith(pattern.slice(0, -1) + "/");
        }
        return lowerName === pattern || lowerName.includes(pattern);
      });
    },
    [getExclusionPatterns],
  );

  // Simulate diff by listing remote entries and comparing with a mock local scan
  // In production this would call an actual compare API
  const doScan = useCallback(async () => {
    if (!ptyId) return;
    setScanning(true);
    setError(null);
    try {
      const remoteEntries = await api.sftpLs(ptyId, null);

      // Build diff list based on remote entries
      // For real implementation we'd also scan the local directory via a new Tauri command
      const newDiffs: DiffItem[] = remoteEntries
        .filter((e) => !isExcluded(e.name))
        .map((e) => ({
          name: e.name,
          kind: e.kind as "file" | "dir",
          localSize: null, // Would be populated by actual local scan
          remoteSize: e.size ?? 0,
          localMtime: null,
          remoteMtime: Date.now(),
          status: "only_remote" as const,
          checked: true,
        }));

      setDiffs(newDiffs);
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }, [ptyId, isExcluded]);

  // Auto-scan when dialog opens
  useEffect(() => {
    if (open && ptyId) {
      setRemotePath(remoteCwd);
    }
  }, [open, ptyId, remoteCwd]);

  const toggleDiffCheck = (index: number) => {
    setDiffs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, checked: !d.checked } : d)),
    );
  };

  const toggleAllChecks = () => {
    const allChecked = diffs.every((d) => d.checked);
    setDiffs((prev) => prev.map((d) => ({ ...d, checked: !allChecked })));
  };

  async function selectLocalDir() {
    try {
      const dir = await openDialog({ directory: true });
      if (dir && !Array.isArray(dir)) {
        setLocalPath(dir.replace(/\\/g, "/"));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSync() {
    if (!ptyId) return;
    setSyncing(true);
    setError(null);

    const checkedDiffs = diffs.filter((d) => d.checked && d.status !== "same");
    const addTask = useTransferStore.getState().addTask;

    try {
      for (const item of checkedDiffs) {
        if (item.kind === "dir") continue;

        const localFile = `${localPath}/${item.name}`;
        const remoteFile = `${remotePath}/${item.name}`;

        if (direction === "upload" || direction === "bidirectional") {
          if (item.status === "only_local" || item.status === "different") {
            addTask({
              fileName: item.name,
              direction: "upload",
              source: localFile,
              target: remoteFile,
              size: item.localSize ?? 0,
              ptyId,
            });
          }
        }

        if (direction === "download" || direction === "bidirectional") {
          if (item.status === "only_remote" || item.status === "different") {
            addTask({
              fileName: item.name,
              direction: "download",
              source: remoteFile,
              target: localFile,
              size: item.remoteSize ?? 0,
              ptyId,
            });
          }
        }
      }

      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  if (!open) return null;

  const stats = {
    total: diffs.length,
    onlyLocal: diffs.filter((d) => d.status === "only_local").length,
    onlyRemote: diffs.filter((d) => d.status === "only_remote").length,
    different: diffs.filter((d) => d.status === "different").length,
    same: diffs.filter((d) => d.status === "same").length,
    checked: diffs.filter((d) => d.checked).length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onContextMenu={(e) => e.preventDefault()}>
      <div className="w-[680px] max-h-[80vh] flex flex-col rounded-lg bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-gray-800)]">
          <h3 className="text-sm font-medium text-white">{t(lang_, "folderSyncTitle")}</h3>
          <button onClick={onClose} className="text-[var(--color-gray-400)] hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Paths */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-gray-400)] mb-1">{t(lang_, "syncLocalDir")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="/path/to/local/dir"
                  className="flex-1 h-8 px-2 rounded text-xs bg-[var(--color-gray-950)] border border-[var(--color-gray-700)] text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-[var(--color-blue-500)]"
                />
                <button onClick={selectLocalDir} className="h-8 px-2 rounded text-xs bg-[var(--color-gray-800)] text-white hover:bg-[var(--color-gray-700)]">
                  <FolderOpen className="size-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-gray-400)] mb-1">{t(lang_, "syncRemoteDir")}</label>
              <input
                type="text"
                value={remotePath}
                readOnly
                className="w-full h-8 px-2 rounded text-xs bg-[var(--color-gray-950)] border border-[var(--color-gray-700)] text-white opacity-70"
              />
            </div>
          </div>

          {/* Direction selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-gray-400)]">{t(lang_, "syncDirection")}:</span>
            <div className="flex rounded overflow-hidden border border-[var(--color-gray-700)]">
              {([
                { key: "upload" as const, icon: ArrowUpFromLine, label: t(lang_, "syncUpload") },
                { key: "download" as const, icon: ArrowDownToLine, label: t(lang_, "syncDownload") },
                { key: "bidirectional" as const, icon: ArrowLeftRight, label: t(lang_, "syncBidirectional") },
              ]).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setDirection(key)}
                  title={label}
                  className={[
                    "flex items-center gap-1 px-3 py-1.5 text-xs transition-colors",
                    direction === key
                      ? "bg-blue-600 text-white"
                      : "bg-transparent text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)]",
                  ].join(" ")}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Exclusion rules */}
          <div>
            <label className="block text-xs text-[var(--color-gray-400)] mb-1">{t(lang_, "syncExclusions")}</label>
            <input
              type="text"
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              className="w-full h-8 px-2 rounded text-xs bg-[var(--color-gray-950)] border border-[var(--color-gray-700)] text-white outline-none focus:border-[var(--color-blue-500)]"
            />
          </div>

          {/* Scan button & Stats */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => doScan()}
              disabled={scanning || !ptyId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t(lang_, "syncScan")}
            </button>
            {diffs.length > 0 ? (
              <div className="text-[10px] text-[var(--color-gray-500)] tabular-nums">
                {tf(lang_, "syncStats", {
                  total: String(stats.total),
                  onlyLocal: String(stats.onlyLocal),
                  onlyRemote: String(stats.onlyRemote),
                  different: String(stats.different),
                })}
              </div>
            ) : null}
          </div>

          {/* Error */}
          {error ? (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded bg-red-900/30 text-red-300 text-xs">
              <AlertCircle className="size-3.5 flex-shrink-0" />
              {error}
            </div>
          ) : null}

          {/* Diff list */}
          {diffs.length > 0 ? (
            <div className="border border-[var(--color-gray-800)] rounded overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-gray-850)] border-b border-[var(--color-gray-800)]">
                <span className="text-xs text-[var(--color-gray-300)]">{t(lang_, "syncDiffList")}</span>
                <button onClick={toggleAllChecks} className="text-[10px] text-blue-400 hover:underline">
                  {diffs.every((d) => d.checked) ? t(lang_, "syncUncheckAll") : t(lang_, "syncCheckAll")}
                </button>
              </div>
              <div className="max-h-52 overflow-auto divide-y divide-[var(--color-gray-850)]">
                {diffs.map((d, i) => {
                  const statusColor =
                    d.status === "only_local"
                      ? "text-green-400"
                      : d.status === "only_remote"
                        ? "text-blue-400"
                        : d.status === "different"
                          ? "text-yellow-400"
                          : "text-[var(--color-gray-500)]";
                  const statusLabel =
                    d.status === "only_local"
                      ? t(lang_, "syncOnlyLocal")
                      : d.status === "only_remote"
                        ? t(lang_, "syncOnlyRemote")
                        : d.status === "different"
                          ? t(lang_, "syncDifferent")
                          : t(lang_, "syncSame");
                  return (
                    <div
                      key={d.name + d.kind}
                      className={`flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-gray-850)] ${d.checked ? "" : "opacity-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={d.checked}
                        onChange={() => toggleDiffCheck(i)}
                        className="rounded border-[var(--color-gray-600)] accent-blue-500"
                      />
                      <span className={`text-xs truncate flex-1 ${d.kind === "dir" ? "text-yellow-300 font-medium" : "text-[var(--color-gray-200)]"}`}>
                        {d.name}
                      </span>
                      <span className={`text-[10px] ${statusColor}`}>{statusLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-gray-800)]">
          <button onClick={onClose} disabled={syncing} className="px-4 py-1.5 rounded text-xs bg-[var(--color-gray-800)] text-white hover:bg-[var(--color-gray-700)] disabled:opacity-50">
            {t(lang_, "cancel")}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || diffs.length === 0 || !localPath}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {t(lang_, "syncStart")}
          </button>
        </div>
      </div>
    </div>
  );
}
