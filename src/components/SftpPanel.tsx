import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RemoteEntry, UUID } from "../types";
import { api } from "../api";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t, tf } from "../lib/i18n";
import { RefreshCw, ChevronUp, ChevronLeft, ChevronRight, FolderPlus, Upload, Columns2, Rows2, X, Search, File, Folder, Eye, EyeOff, ArrowLeftRight } from "lucide-react";
import { TransferProgress } from "./TransferProgress";
import { FolderSyncDialog } from "./FolderSyncDialog";
import { RemoteFileEditor } from "./RemoteFileEditor";
import { FileOverwriteDialog, type FileOverwriteAction } from "./FileOverwriteDialog";
import { SftpConfirmDialog } from "./SftpConfirmDialog";
import { SftpRenameDialog } from "./SftpRenameDialog";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function basename(p: string) {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

export function SftpPanel(props: {
  ptyId: UUID | null;
  splitDirection?: "horizontal" | "vertical";
  onToggleSplitDirection?: () => void;
  onClose?: () => void;
  lang?: string;
}) {
  const lang = props.lang ?? "zh-CN";
  const [cwd, setCwd] = useState<string>("");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterType, setFilterType] = useState<"all" | "dir" | "file">("all");
  const [showHidden, setShowHidden] = useState(true);
  const [transferQueue, setTransferQueue] = useState<{
    fileName: string;
    status: "waiting" | "transferring" | "complete" | "failed";
    progress: number;
  }[]>([]);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [dirHistory, setDirHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canGoBack = historyIndex >= 0;
  const canGoForward = historyIndex < dirHistory.length - 1;
  const [editingFile, setEditingFile] = useState<{ name: string; path: string } | null>(null);
  const [overwriteDialog, setOverwriteDialog] = useState<{
    open: boolean;
    fileName: string;
    renameName: string;
    localPath: string;
    resolve: ((result: [FileOverwriteAction, string]) => void) | null;
  }>({ open: false, fileName: "", renameName: "", localPath: "", resolve: null });
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    entry: RemoteEntry | null;
  }>({ open: false, entry: null });
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    entry: RemoteEntry | null;
  }>({ open: false, entry: null });
  const [menu, setMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    entry: RemoteEntry | null;
  }>({ open: false, x: 0, y: 0, entry: null });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!props.ptyId) return;
    setBusy(true);
    setError(null);
    try {
      const doRefresh = async () => {
        await api.sftpWaitReady(props.ptyId!, 30_000);
        const pwd = await api.sftpPwd(props.ptyId!);
        setCwd(pwd);
        const list = await api.sftpLs(props.ptyId!, null);
        setEntries(list);
      };
      try {
        await doRefresh();
      } catch (e) {
        const msg = String(e);
        const needFallback =
          msg.includes("No such file") ||
          msg.includes("no such file") ||
          msg.includes("Couldn't stat") ||
          msg.includes("can't") ||
          msg.includes("cannot") ||
          msg.includes("Failure");
        if (needFallback) {
          await api.sftpCd(props.ptyId, "..");
          await doRefresh();
        } else {
          throw e;
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [props.ptyId]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!menu.open) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = menuRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setMenu({ open: false, x: 0, y: 0, entry: null });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu({ open: false, x: 0, y: 0, entry: null });
      }
    };
    const onScroll = () => setMenu({ open: false, x: 0, y: 0, entry: null });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu.open]);

  // 上传文件（支持文件名重复检测、恢复检查、异步不阻塞）
  const uploadWithResumeCheck = useCallback(
    async (paths: string[]) => {
      if (!props.ptyId) return;
      if (!paths.length) return;

      // 准备上传队列
      const queue: {
        localPath: string;
        name: string;
        remote: string;
        action: "upload" | "skip" | null;
      }[] = [];

      // 检查每个文件
      for (const p of paths) {
        const normalizedPath = p.replace(/\\/g, "/");
        const name = basename(normalizedPath);
        const base = cwd.replace(/\\/g, "/").replace(/\/+$/g, "");
        const remote = base ? `${base}/${name}` : name;

        // 检查远程是否存在同名文件
        const remoteExists = entries.some(
          (e) => e.name === name && e.kind !== "dir"
        );

        if (remoteExists) {
          // 远程存在同名文件，显示覆盖确认对话框（三个选项：覆盖、重命名、取消）
          const [action, renameName] = await new Promise<[FileOverwriteAction, string]>((resolve) => {
            // 生成默认的重命名文件名
            const defaultRename = name.includes(".")
              ? name.slice(0, name.lastIndexOf(".")) + "_copy" + name.slice(name.lastIndexOf("."))
              : name + "_copy";
            setOverwriteDialog({
              open: true,
              fileName: name,
              renameName: defaultRename,
              localPath: p,
              resolve,
            });
          });

          if (action === "overwrite") {
            // 用户选择覆盖
            queue.push({ localPath: p, name, remote, action: "upload" });
          } else if (action === "rename" && renameName) {
            // 用户选择重命名，使用用户输入的文件名
            const newRemote = base ? `${base}/${renameName}` : renameName;
            queue.push({ localPath: p, name: renameName, remote: newRemote, action: "upload" });
          } else {
            // 用户选择取消，跳过此文件
            // 不添加到队列中
          }
        } else {
          // 远程不存在，直接上传
          queue.push({ localPath: p, name, remote, action: "upload" });
        }
      }

      // 过滤掉被跳过的文件
      const filesToUpload = queue.filter((f) => f.action === "upload");
      if (filesToUpload.length === 0) return;

      // 初始化传输队列状态
      setTransferQueue(
        filesToUpload.map((f) => ({
          fileName: f.name,
          status: "waiting" as const,
          progress: 0,
        }))
      );

      // 异步执行上传，不阻塞界面
      (async () => {
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];

          // 更新状态为传输中
          setTransferQueue((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "transferring" } : f
            )
          );

          try {
            // TODO: 断点续传功能暂未完善，后续需要实现：
            // 1. 检测本地和远程文件是否确实是同一个文件（通过文件大小+修改时间或内容hash）
            // 2. 只有在确认是同一文件时才提示断点续传
            // 3. 目前临时直接上传，不提示断点续传
            await api.sftpPut(props.ptyId!, file.localPath, file.remote);

            // 上传完成
            setTransferQueue((prev) =>
              prev.map((f, idx) =>
                idx === i ? { ...f, status: "complete", progress: 100 } : f
              )
            );
          } catch (e) {
            // 上传失败
            setTransferQueue((prev) =>
              prev.map((f, idx) =>
                idx === i ? { ...f, status: "failed" } : f
              )
            );
            setError(`Upload failed: ${file.name} - ${e}`);
          }

          // 等待一小段时间让用户看到状态
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // 所有文件处理完毕，清空队列并刷新
        await refresh();
        setTimeout(() => setTransferQueue([]), 2000);
      })();
    },
    [props.ptyId, cwd, refresh, lang, entries],
  );

  // 拖拽上传（支持文件名重复检测、异步不阻塞）
  const uploadDragDrop = useCallback(
    async (paths: string[]) => {
      if (!props.ptyId) return;
      if (!paths.length) return;

      // 准备上传队列
      const queue: {
        localPath: string;
        name: string;
        remote: string;
        action: "upload" | "skip" | null;
      }[] = [];

      // 检查每个文件
      for (const p of paths) {
        const normalizedPath = p.replace(/\\/g, "/");
        const name = basename(normalizedPath);
        const base = cwd.replace(/\\/g, "/").replace(/\/+$/g, "");
        const remote = base ? `${base}/${name}` : name;

        // 检查远程是否存在同名文件
        const remoteExists = entries.some(
          (e) => e.name === name && e.kind !== "dir"
        );

        if (remoteExists) {
          // 远程存在同名文件，显示覆盖确认对话框（三个选项：覆盖、重命名、取消）
          const [action, renameName] = await new Promise<[FileOverwriteAction, string]>((resolve) => {
            // 生成默认的重命名文件名
            const defaultRename = name.includes(".")
              ? name.slice(0, name.lastIndexOf(".")) + "_copy" + name.slice(name.lastIndexOf("."))
              : name + "_copy";
            setOverwriteDialog({
              open: true,
              fileName: name,
              renameName: defaultRename,
              localPath: p,
              resolve,
            });
          });

          if (action === "overwrite") {
            // 用户选择覆盖
            queue.push({ localPath: p, name, remote, action: "upload" });
          } else if (action === "rename" && renameName) {
            // 用户选择重命名，使用用户输入的文件名
            const newRemote = base ? `${base}/${renameName}` : renameName;
            queue.push({ localPath: p, name: renameName, remote: newRemote, action: "upload" });
          } else {
            // 用户选择取消，跳过此文件
          }
        } else {
          // 远程不存在，直接上传
          queue.push({ localPath: p, name, remote, action: "upload" });
        }
      }

      // 过滤掉被跳过的文件
      const filesToUpload = queue.filter((f) => f.action === "upload");
      if (filesToUpload.length === 0) return;

      // 初始化传输队列状态
      setTransferQueue(
        filesToUpload.map((f) => ({
          fileName: f.name,
          status: "waiting" as const,
          progress: 0,
        }))
      );

      // 异步执行上传，不阻塞界面
      (async () => {
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];

          // 更新状态为传输中
          setTransferQueue((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "transferring" } : f
            )
          );

          try {
            await api.sftpPut(props.ptyId!, file.localPath, file.remote);

            // 上传完成
            setTransferQueue((prev) =>
              prev.map((f, idx) =>
                idx === i ? { ...f, status: "complete", progress: 100 } : f
              )
            );
          } catch (e) {
            // 上传失败
            setTransferQueue((prev) =>
              prev.map((f, idx) =>
                idx === i ? { ...f, status: "failed" } : f
              )
            );
            setError(`Upload failed: ${file.name} - ${e}`);
          }

          // 等待一小段时间让用户看到状态
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        // 所有文件处理完毕，清空队列并刷新
        await refresh();
        setTimeout(() => setTransferQueue([]), 2000);
      })();
    },
    [props.ptyId, cwd, refresh, entries],
  );

  useEffect(() => {
    let un: (() => void) | null = null;
    getCurrentWindow()
      .onDragDropEvent((e) => {
        if (!props.ptyId) return;
        if (e.payload.type !== "drop") return;
        const paths = e.payload.paths ?? [];
        uploadDragDrop(paths).catch(() => undefined);
      })
      .then((fn) => {
        un = fn;
      })
      .catch(() => undefined);
    return () => un?.();
  }, [props.ptyId, uploadDragDrop]);

  const dirsFirst = useMemo(() => {
    const copy = [...entries];
    copy.sort((a, b) => {
      if (a.kind === "dir" && b.kind !== "dir") return -1;
      if (a.kind !== "dir" && b.kind === "dir") return 1;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let list = dirsFirst;
    // Type filter
    if (filterType === "dir") list = list.filter((e) => e.kind === "dir");
    else if (filterType === "file") list = list.filter((e) => e.kind !== "dir");
    // Hidden files filter
    if (!showHidden) {
      list = list.filter((e) => !e.name.startsWith("."));
    }
    // Keyword search
    if (filterKeyword.trim()) {
      const q = filterKeyword.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [dirsFirst, filterType, showHidden, filterKeyword]);

  async function cd(name: string, addToHistory = true) {
    if (!props.ptyId) return;
    // 记录当前目录到历史
    if (addToHistory && cwd) {
      const newHistory = dirHistory.slice(0, historyIndex + 1);
      newHistory.push(cwd);
      setDirHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    setBusy(true);
    setError(null);
    try {
      await api.sftpCd(props.ptyId, name);
      await refresh();
    } catch {
      // 静默失败，不提示
    } finally {
      setBusy(false);
    }
  }

  async function goBack() {
    if (historyIndex < 0 || !props.ptyId) return;
    const targetDir = dirHistory[historyIndex];
    setBusy(true);
    setError(null);
    try {
      await api.sftpCd(props.ptyId, targetDir);
      await refresh();
      setHistoryIndex(historyIndex - 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function goForward() {
    if (historyIndex >= dirHistory.length - 1 || !props.ptyId) return;
    const newIndex = historyIndex + 1;
    const targetDir = dirHistory[newIndex];
    setBusy(true);
    setError(null);
    try {
      await api.sftpCd(props.ptyId, targetDir);
      await refresh();
      setHistoryIndex(newIndex);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function up() {
    if (!props.ptyId) return;
    setBusy(true);
    setError(null);
    try {
      await api.sftpCd(props.ptyId, "..");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function mkdir() {
    if (!props.ptyId) return;
    const name = window.prompt(t(lang, "sftpPromptNewFolderName"));
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await api.sftpMkdir(props.ptyId, name);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: RemoteEntry) {
    if (!props.ptyId) return;
    setConfirmDialog({ open: true, entry });
  }

  async function confirmRemove() {
    const entry = confirmDialog.entry;
    setConfirmDialog({ open: false, entry: null });
    if (!entry || !props.ptyId) return;
    setBusy(true);
    setError(null);
    try {
      await api.sftpRm(props.ptyId, entry.name, entry.kind === "dir");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rename(entry: RemoteEntry) {
    if (!props.ptyId) return;
    setRenameDialog({ open: true, entry });
  }

  async function confirmRename(newName: string) {
    const entry = renameDialog.entry;
    setRenameDialog({ open: false, entry: null });
    if (!entry || !props.ptyId || !newName) return;
    setBusy(true);
    setError(null);
    try {
      await api.sftpRename(props.ptyId, entry.name, newName);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!props.ptyId) return;
    let paths: string | string[] | null = null;
    try {
      paths = await openDialog({ multiple: true });
    } catch (e) {
      setError(String(e));
      return;
    }
    if (!paths) return;
    const list = Array.isArray(paths) ? paths : [paths];
    await uploadWithResumeCheck(list);
  }

  async function download(entry: RemoteEntry) {
    if (!props.ptyId) return;
    let dir: string | string[] | null = null;
    try {
      dir = await openDialog({ directory: true });
    } catch (e) {
      setError(String(e));
      return;
    }
    if (!dir || Array.isArray(dir)) return;
    // 规范化 Windows 路径
    const normalizedDir = dir.replace(/\\/g, "/");
    const local = `${normalizedDir}/${basename(entry.name)}`;

    // 异步下载，不阻塞界面
    (async () => {
      setError(null);

      // 初始化传输状态
      setTransferQueue([{
        fileName: entry.name,
        status: "transferring",
        progress: 0,
      }]);

      try {
        // Check for resume
        const info = await api.sftpLocalFileInfo(local).catch(() => null);
        const shouldResume = info?.exists && info!.size > 0;
        let useResume = false;

        if (shouldResume) {
          useResume = await tauriConfirm(
            tf(lang, "transferResumeMessage", { size: formatSize(info!.size) }),
            { title: "断点续传", kind: "info" }
          ).catch(() => false);
        }

        if (useResume) {
          await api.sftpGetPartial(props.ptyId!, entry.name, local);
        } else {
          await api.sftpGet(props.ptyId!, entry.name, local);
        }
        setTransferQueue([{
          fileName: entry.name,
          status: "complete",
          progress: 100,
        }]);
      } catch (e) {
        setTransferQueue([{
          fileName: entry.name,
          status: "failed",
          progress: 0,
        }]);
        setError(`Download failed: ${entry.name} - ${e}`);
      }

      setTimeout(() => setTransferQueue([]), 3000);
    })();
  }

  function closeMenu() {
    setMenu({ open: false, x: 0, y: 0, entry: null });
  }

  function openContextMenu(ev: React.MouseEvent, entry: RemoteEntry | null) {
    if (!props.ptyId) return;
    if (busy) return;
    ev.preventDefault();
    const menuW = 180;
    const menuH = 260;
    const x = Math.max(8, Math.min(ev.clientX, window.innerWidth - menuW - 8));
    const y = Math.max(8, Math.min(ev.clientY, window.innerHeight - menuH - 8));
    setMenu({ open: true, x, y, entry });
  }

  async function menuRefresh() {
    closeMenu();
    await refresh();
  }

  async function menuUp() {
    closeMenu();
    await up();
  }

  async function menuMkdir() {
    closeMenu();
    await mkdir();
  }

  async function menuUpload() {
    closeMenu();
    await upload();
  }

  async function menuDownload(entry: RemoteEntry) {
    closeMenu();
    await download(entry);
  }

  async function menuRename(entry: RemoteEntry) {
    closeMenu();
    await rename(entry);
  }

  async function menuRemove(entry: RemoteEntry) {
    closeMenu();
    await remove(entry);
  }

  return (
    <div className="h-full w-full flex flex-col bg-[var(--color-gray-950)]">
      <div className="h-9 bg-[var(--color-gray-900)] border-b border-[var(--color-gray-800)] flex items-center gap-1 px-2">
        {props.onClose ? (
          <button
            onClick={() => props.onClose?.()}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-red-600 hover:text-white disabled:opacity-50"
            title={t(lang, "sftpClose")}
          >
            <X className="size-4" />
          </button>
        ) : null}
        {props.onToggleSplitDirection ? (
          <button
            onClick={() => props.onToggleSplitDirection?.()}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
            title={t(lang, "sftpSplitToggleTitle")}
          >
            {props.splitDirection === "vertical" ? (
              <Columns2 className="size-4" />
            ) : (
              <Rows2 className="size-4" />
            )}
          </button>
        ) : null}

        <button
          onClick={refresh}
          disabled={busy || !props.ptyId}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
          title={t(lang, "sftpRefresh")}
        >
          <RefreshCw className="size-4" />
        </button>
        <button
          onClick={goBack}
          disabled={busy || !props.ptyId || !canGoBack}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-30"
          title={t(lang, "sftpGoBack") || "返回"}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={goForward}
          disabled={busy || !props.ptyId || !canGoForward}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-30"
          title={t(lang, "sftpGoForward") || "前进"}
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          onClick={up}
          disabled={busy || !props.ptyId}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
          title={t(lang, "sftpUp")}
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          onClick={mkdir}
          disabled={busy || !props.ptyId}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
          title={t(lang, "sftpNewFolder")}
        >
          <FolderPlus className="size-4" />
        </button>
        <button
          onClick={() => setShowSearchBar(!showSearchBar)}
          disabled={!props.ptyId}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
          title={t(lang, "sftpSearch") || "搜索"}
        >
          <Search className="size-4" />
        </button>
        <button
          onClick={upload}
          disabled={busy || !props.ptyId}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
          title={t(lang, "sftpUpload")}
        >
          <Upload className="size-4" />
        </button>
        <button
          onClick={() => setSyncDialogOpen(true)}
          disabled={busy || !props.ptyId}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
          title={t(lang, "folderSyncTitle")}
        >
          <ArrowLeftRight className="size-4" />
        </button>

        <div className="flex-1 min-w-0 px-2" title={cwd}>
          <input
            type="text"
            defaultValue={cwd}
            disabled={busy || !props.ptyId}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                const input = e.currentTarget;
                const path = input.value.trim();
                if (!path || path === cwd) return;
                input.blur();
                await cd(path);
              }
            }}
            className="w-full text-xs text-[var(--color-gray-300)] bg-transparent border-none outline-none focus:ring-0 disabled:opacity-50 truncate"
          />
        </div>
      </div>

      {error ? <div className="px-2 py-2 text-red-400 text-xs">{error}</div> : null}

      {/* 搜索工具栏 */}
      {showSearchBar ? (
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[var(--color-gray-800)] bg-[var(--color-gray-900)]">
        <div className="relative flex items-center">
          <Search className="absolute left-2 size-3 text-[var(--color-gray-500)]" />
          <input
            value={filterKeyword}
            onChange={(e) => setFilterKeyword(e.target.value)}
            placeholder={`${t(lang, "sftpFilterPlaceholder")}...`}
            className="h-6 w-32 pl-6 pr-2 rounded text-xs bg-[var(--color-gray-950)] border border-[var(--color-gray-700)] text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-[var(--color-blue-500)]"
          />
        </div>

        {/* 类型筛选按钮组 */}
        <div className="flex rounded overflow-hidden border border-[var(--color-gray-700)]">
          {(["all", "dir", "file"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type === filterType ? "all" : type)}
              title={
                type === "all"
                  ? t(lang, "sftpFilterAll")
                  : type === "dir"
                    ? t(lang, "sftpFilterDirs")
                    : t(lang, "sftpFilterFiles")
              }
              className={[
                "px-1.5 h-6 text-[11px] leading-none transition-colors",
                filterType === type
                  ? "bg-blue-600 text-white"
                  : "bg-transparent text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)]",
              ].join(" ")}
            >
              {type === "all" ? t(lang, "sftpFilterAll") : type === "dir" ? <Folder className="size-3" /> : <File className="size-3" />}
            </button>
          ))}
        </div>

        {/* 隐藏文件开关 */}
        <button
          onClick={() => setShowHidden((v) => !v)}
          title={showHidden ? t(lang, "sftpHideHidden") : t(lang, "sftpShowHidden")}
          className={[
            "w-7 h-6 flex items-center justify-center rounded text-xs transition-colors",
            showHidden
              ? "bg-[var(--color-gray-700)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-600)]"
              : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)] hover:bg-[var(--color-gray-700)]",
          ].join(" ")}
        >
          {showHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>

        <div className="flex-1" />
        <span className="text-[10px] text-[var(--color-gray-500)] tabular-nums">
          {filteredEntries.length}/{dirsFirst.length}
        </span>
      </div>
      ) : null}

      <div className="flex-1 overflow-auto" onContextMenu={(ev) => openContextMenu(ev, null)}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b border-[var(--color-gray-800)] text-[var(--color-gray-400)]">
              <th className="px-2 py-2 font-medium">{t(lang, "sftpName")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr
                key={e.raw}
                className="border-b border-[var(--color-gray-800)] hover:bg-[var(--color-gray-900)]"
                onContextMenu={(ev) => {
                  ev.stopPropagation();
                  openContextMenu(ev, e);
                }}
              >
                <td className="px-2 py-2">
                  {e.kind === "dir" ? (
                    <a
                      href="#"
                      onClick={(ev) => {
                        ev.preventDefault();
                        cd(e.name).catch(() => undefined);
                      }}
                      className="text-[var(--color-blue-600)] hover:underline"
                    >
                      {e.name}
                    </a>
                  ) : (
                    e.name
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {menu.open ? (
        <div
          ref={menuRef}
          className="fixed z-50 w-[180px] rounded border border-[var(--color-gray-800)] bg-[var(--color-gray-900)] shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)] disabled:opacity-50 disabled:hover:bg-[var(--color-gray-900)]"
            onClick={() => menuRefresh().catch(() => undefined)}
          >
            {t(lang, "sftpRefresh")}
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)] disabled:opacity-50 disabled:hover:bg-[var(--color-gray-900)]"
            onClick={() => menuUp().catch(() => undefined)}
          >
            {t(lang, "sftpUpToParent")}
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)] disabled:opacity-50 disabled:hover:bg-[var(--color-gray-900)]"
            onClick={() => menuMkdir().catch(() => undefined)}
          >
            {t(lang, "sftpNewFolder")}
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)] disabled:opacity-50 disabled:hover:bg-[var(--color-gray-900)]"
            onClick={() => menuUpload().catch(() => undefined)}
          >
            {t(lang, "sftpUpload")}
          </button>

          {props.onToggleSplitDirection ? (
            <button
              className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)]"
              onClick={() => {
                closeMenu();
                props.onToggleSplitDirection?.();
              }}
            >
              {props.splitDirection === "vertical" ? t(lang, "sftpSwitchToHorizontal") : t(lang, "sftpSwitchToVertical")}
            </button>
          ) : null}

          {menu.entry ? <div className="h-px bg-[var(--color-gray-800)] my-1" /> : null}

          {menu.entry && menu.entry.kind !== "dir" ? (
            <button
              className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)]"
              onClick={() => {
                closeMenu();
                setEditingFile({ name: menu.entry!.name, path: `${cwd}/${menu.entry!.name}` });
              }}
            >
              {t(lang, "edit")}
            </button>
          ) : null}
          {menu.entry && menu.entry.kind !== "dir" ? (
            <button
              className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)]"
              onClick={() => menuDownload(menu.entry!).catch(() => undefined)}
            >
              {t(lang, "sftpDownload")}
            </button>
          ) : null}
          {menu.entry ? (
            <button
              className="w-full text-left px-3 py-2 text-sm text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)]"
              onClick={() => menuRename(menu.entry!).catch(() => undefined)}
            >
              {t(lang, "rename")}
            </button>
          ) : null}
          {menu.entry ? (
            <button
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/30 font-medium"
              onClick={() => menuRemove(menu.entry!).catch(() => undefined)}
            >
              {t(lang, "delete")}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Transfer Progress - 显示传输队列（不阻塞界面） */}
      {transferQueue.length > 0 ? (
        <div className="border-t border-[var(--color-gray-800)] p-2 bg-[var(--color-gray-900)]">
          <div className="text-xs text-[var(--color-gray-400)] mb-2">
            {t(lang, "sftpTransferQueue")} ({transferQueue.filter(f => f.status === "complete").length}/{transferQueue.length})
          </div>
          {transferQueue.map((t, idx) => (
            <TransferProgress
              key={`${t.fileName}-${idx}`}
              fileName={t.fileName}
              status={t.status}
              progress={t.progress}
              lang={lang}
            />
          ))}
        </div>
      ) : null}

      <FolderSyncDialog
        open={syncDialogOpen}
        ptyId={props.ptyId}
        remoteCwd={cwd}
        onClose={() => setSyncDialogOpen(false)}
        lang={lang}
      />

      {editingFile ? (
        <RemoteFileEditor
          open={!!editingFile}
          ptyId={props.ptyId}
          remotePath={editingFile.path}
          fileName={editingFile.name}
          onClose={() => setEditingFile(null)}
          lang={lang}
        />
      ) : null}

      <FileOverwriteDialog
        open={overwriteDialog.open}
        fileName={overwriteDialog.fileName}
        renameName={overwriteDialog.renameName}
        onClose={() => {
          if (overwriteDialog.resolve) {
            overwriteDialog.resolve(["cancel", ""]);
          }
          setOverwriteDialog({ open: false, fileName: "", renameName: "", localPath: "", resolve: null });
        }}
        onAction={(action, renameName) => {
          if (overwriteDialog.resolve) {
            overwriteDialog.resolve([action, renameName ?? ""]);
          }
          setOverwriteDialog({ open: false, fileName: "", renameName: "", localPath: "", resolve: null });
        }}
        lang={lang}
      />

      {/* 删除确认对话框 */}
      <SftpConfirmDialog
        open={confirmDialog.open}
        fileName={confirmDialog.entry?.name}
        lang={lang}
        onConfirm={confirmRemove}
        onCancel={() => setConfirmDialog({ open: false, entry: null })}
      />

      {/* 重命名对话框 */}
      <SftpRenameDialog
        open={renameDialog.open}
        originalName={renameDialog.entry?.name ?? ""}
        lang={lang}
        onConfirm={confirmRename}
        onCancel={() => setRenameDialog({ open: false, entry: null })}
      />
    </div>
  );
}
