import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RemoteEntry, UUID } from "../types";
import { api } from "../api";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t, tf } from "../lib/i18n";
import { RefreshCw, ChevronUp, FolderPlus, Upload, Columns2, Rows2, X } from "lucide-react";

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

  const uploadPaths = useCallback(
    async (paths: string[]) => {
      if (!props.ptyId) return;
      if (!paths.length) return;
      setBusy(true);
      setError(null);
      try {
        for (const p of paths) {
          const name = basename(p);
          const base = cwd.replace(/\\/g, "/").replace(/\/+$/g, "");
          const remote = base ? `${base}/${name}` : name;
          await api.sftpPut(props.ptyId, p, remote);
        }
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [props.ptyId, cwd, refresh],
  );

  useEffect(() => {
    let un: (() => void) | null = null;
    getCurrentWindow()
      .onDragDropEvent((e) => {
        if (!props.ptyId) return;
        if (e.payload.type !== "drop") return;
        const paths = e.payload.paths ?? [];
        uploadPaths(paths).catch(() => undefined);
      })
      .then((fn) => {
        un = fn;
      })
      .catch(() => undefined);
    return () => un?.();
  }, [props.ptyId, uploadPaths]);

  const dirsFirst = useMemo(() => {
    const copy = [...entries];
    copy.sort((a, b) => {
      if (a.kind === "dir" && b.kind !== "dir") return -1;
      if (a.kind !== "dir" && b.kind === "dir") return 1;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [entries]);

  async function cd(name: string) {
    if (!props.ptyId) return;
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
    const ok = window.confirm(tf(lang, "sftpConfirmDelete", { name: entry.name }));
    if (!ok) return;
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
    const to = window.prompt(t(lang, "sftpPromptRenameTo"), entry.name);
    if (!to || to === entry.name) return;
    setBusy(true);
    setError(null);
    try {
      await api.sftpRename(props.ptyId, entry.name, to);
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
    await uploadPaths(list);
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
    const local = `${dir.replace(/\\/g, "/")}/${basename(entry.name)}`;
    setBusy(true);
    setError(null);
    try {
      await api.sftpGet(props.ptyId, entry.name, local);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
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
          onClick={upload}
          disabled={busy || !props.ptyId}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white disabled:opacity-50"
          title={t(lang, "sftpUpload")}
        >
          <Upload className="size-4" />
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

      <div className="flex-1 overflow-auto" onContextMenu={(ev) => openContextMenu(ev, null)}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b border-[var(--color-gray-800)] text-[var(--color-gray-400)]">
              <th className="px-2 py-2 font-medium">{t(lang, "sftpName")}</th>
            </tr>
          </thead>
          <tbody>
            {dirsFirst.map((e) => (
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
            <button className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-[var(--color-gray-800)]" onClick={() => menuRemove(menu.entry!).catch(() => undefined)}>
              {t(lang, "delete")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
