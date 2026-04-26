import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar";
import { SessionEditor } from "./components/SessionEditor";
import { TabBar } from "./components/TabBar";
import { Modal } from "./components/Modal";
import { TerminalView } from "./components/TerminalView";
import { TerminalSearchBar } from "./components/TerminalSearchBar";
import { CommandHistoryModal } from "./components/CommandHistoryModal";
import { PasteConfirmDialog } from "./components/PasteConfirmDialog";

import { SftpPanel } from "./components/SftpPanel";
import { MonitorPanel } from "./components/MonitorPanel";
import { SettingsModal } from "./components/SettingsModal";
import {
  GroupNameModal,
  AuthPrompt,
  CommandPaletteBody,
} from "./components/AppComponents";
import { useAppStore } from "./store/appStore";
import type { AuthPromptEvent, HostKeyPromptEvent, SessionPublic, UUID } from "./types";
import { api } from "./api";
import { Folder, PlugZap, Activity } from "lucide-react";
import { useShortcuts } from "./hooks/useShortcuts";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { dbg } from "./lib/debug";
import { DEFAULT_COMMON_COMMANDS, getDefaultCommonCommands } from "./lib/defaultCommonCommands";
import { t, tf } from "./lib/i18n";
import { DEFAULT_SHORTCUTS } from "./lib/defaultShortcuts";
import { applyTheme, DEFAULT_THEME } from "./lib/themes";
import { checkPaste, type PasteCheckResult } from "./lib/pasteProtection";
import { logError, generateReportText, getErrorCount } from "./lib/errorLogger";
import type { Terminal } from "xterm";
import type { SearchAddon } from "@xterm/addon-search";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null; errorId: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, errorId: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to persistent store and console
    const logged = logError(error, errorInfo);
    this.setState({ errorId: logged.id });
  }

  handleCopyReport = () => {
    if (!this.state.error) return;
    const text = generateReportText({
      id: this.state.errorId ?? "unknown",
      timestamp: Date.now(),
      message: this.state.error.message,
      stack: this.state.error.stack ?? undefined,
      componentStack: "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      appVersion: "0.1.0",
    });
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const errorCount = getErrorCount();
      return (
        <div className="w-full h-full bg-[var(--color-gray-950)] text-[var(--color-gray-300)] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-red-400 font-medium">⚠ Error</span>
              {errorCount > 1 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300">
                  +{errorCount - 1} more
                </span>
              )}
            </div>

            <div className="text-sm text-[var(--color-gray-200)] mb-3 font-mono break-all max-h-24 overflow-auto">
              {this.state.error.message}
            </div>

            {this.state.error.stack && (
              <details className="mb-4">
                <summary className="text-xs cursor-pointer text-[var(--color-gray-500)] hover:text-[var(--color-gray-300)] mb-2">
                  Stack trace
                </summary>
                <pre className="text-xs text-[var(--color-gray-500)] overflow-auto max-h-32 whitespace-pre-wrap">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-xs bg-[var(--color-gray-800)] rounded text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)]"
                onClick={() => this.setState({ hasError: false, error: null, errorId: null })}
              >
                Retry
              </button>
              <button
                className="px-3 py-1.5 text-xs bg-[var(--color-blue-600)] rounded text-white hover:bg-[var(--color-blue-700)]"
                onClick={this.handleCopyReport}
              >
                Copy Report
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const store = useAppStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionPublic | null>(null);
  const [tempEditorOpen, setTempEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [commandPaletteActiveIndex, setCommandPaletteActiveIndex] = useState(0);
  const [lastTermSize, setLastTermSize] = useState<{ cols: number; rows: number }>({ cols: 120, rows: 30 });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const activeTermRef = useRef<Terminal | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [commandHistoryOpen, setCommandHistoryOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [pasteCheckResult, setPasteCheckResult] = useState<PasteCheckResult | null>(null);
  const [groupNameModal, setGroupNameModal] = useState<{ mode: "new" | "rename"; groupId: UUID | null; initial: string } | null>(null);
  const [groupNameValue, setGroupNameValue] = useState("");

  const lang = store.settings?.language ?? "zh-CN";
  const layoutMode = store.settings?.layoutMode ?? "compact";

  const isTauri = useMemo(() => {
    const w = window as any;
    return !!w.__TAURI_INTERNALS__ || !!w.__TAURI__;
  }, []);

  useEffect(() => {
    store.refreshAll().catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.layout = layoutMode;
  }, [layoutMode]);

  // 主题应用
  useEffect(() => {
    const themeKey = store.settings?.theme ?? DEFAULT_THEME;
    applyTheme(themeKey);
  }, [store.settings?.theme]);

  useEffect(() => {
    let un1: (() => void) | null = null;
    let un2: (() => void) | null = null;

    listen<HostKeyPromptEvent>("zssh://hostkey-prompt", (e) => {
      dbg("info", "pty->ui:hostkey-prompt", { ptyId: e.payload.ptyId, messageLen: e.payload.message.length });
      store.clearPrompts();
      useAppStore.setState({ hostKeyPrompt: { ptyId: e.payload.ptyId, message: e.payload.message } });
    })
      .then((fn) => {
        un1 = fn;
      })
      .catch(() => undefined);

    listen<AuthPromptEvent>("zssh://auth-prompt", (e) => {
      dbg("info", "pty->ui:auth-prompt", { ptyId: e.payload.ptyId, kind: e.payload.kind });
      store.clearPrompts();
      useAppStore.setState({ authPrompt: { ptyId: e.payload.ptyId, kind: e.payload.kind } });
    })
      .then((fn) => {
        un2 = fn;
      })
      .catch(() => undefined);

    return () => {
      un1?.();
      un2?.();
    };
  }, []);

  const activeTab = useMemo(() => store.tabs.find((t) => t.id === store.activeTabId) ?? null, [store.tabs, store.activeTabId]);
  const activeSession = useMemo(
    () => (activeTab ? store.sessions.find((s) => s.id === activeTab.sessionId) ?? null : null),
    [activeTab?.sessionId, store.sessions],
  );
  const activeSessionIds = useMemo(() => Array.from(new Set(store.tabs.map((t) => t.sessionId))), [store.tabs]);
  const autoConnectAttemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeTab) return;
    if (activeTab.ptyId) return;
    if (autoConnectAttemptedRef.current.has(activeTab.id)) return;
    autoConnectAttemptedRef.current.add(activeTab.id);

    dbg("info", "ui.autoConnect:attempt", {
      tabId: activeTab.id,
      sessionId: activeTab.sessionId,
      cols: lastTermSize.cols,
      rows: lastTermSize.rows,
      isTauri,
    });

    if (!isTauri) {
      setConnectError(`${t(lang, "previewModeCannotConnect")}\n${t(lang, "useDesktopRun")}`);
      return;
    }

    store.connectTab(activeTab.id, lastTermSize.cols, lastTermSize.rows).catch((e: any) => {
      dbg("error", "ui.autoConnect:failed", { tabId: activeTab.id, message: String(e?.message ?? e ?? t(lang, "connectionFailed")) });
      setConnectError(String(e?.message ?? e ?? t(lang, "connectionFailed")));
    });
  }, [activeTab?.id, activeTab?.ptyId, lastTermSize.cols, lastTermSize.rows, isTauri]);

  // 快捷键处理函数 - 使用 useCallback 确保稳定的函数引用
  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | null = null;
    listen<string>("zssh://menu-shortcut", (e) => {
      if (e.payload === "open_settings") {
        openSettings();
      } else if (e.payload === "toggle_sidebar") {
        toggleSidebar();
      }
    })
      .then((fn) => {
        un = fn;
      })
      .catch(() => undefined);
    return () => {
      un?.();
    };
  }, [isTauri, openSettings, toggleSidebar]);

  // 粘贴安全拦截：监听全局 paste 事件，检测多行/危险命令
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      const inXterm = !!target?.closest?.(".xterm");
      if (!inXterm) return;

      const text = e.clipboardData?.getData("text") ?? "";
      if (!text) return;

      const result = checkPaste(text);
      if (result.safe) return; // 安全，放行

      // 拦截并显示确认对话框
      e.preventDefault();
      e.stopPropagation();
      setPasteCheckResult(result);
    }

    document.addEventListener("paste", onPaste, { capture: true });
    return () => document.removeEventListener("paste", onPaste, { capture: true });
  }, []);

  const addConnection = useCallback(() => {
    setEditingSession(null);
    setEditorOpen(true);
  }, []);

  const newTempConnection = useCallback(() => {
    setTempEditorOpen(true);
  }, []);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteQuery("");
    setCommandPaletteActiveIndex(0);
    setCommandPaletteOpen(true);
  }, []);

  const copySelection = useCallback(() => {
    const text = activeTermRef.current?.getSelection?.() || window.getSelection()?.toString() || "";
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => undefined);
  }, []);

  const toggleSearch = useCallback(() => {
    setSearchVisible((v) => !v);
  }, []);

  const openCommandHistory = useCallback(() => {
    setCommandHistoryOpen(true);
  }, []);

  const handleCommandSelect = useCallback(
    (cmd: string) => {
      const ptyId = store.tabs.find((t) => t.id === store.activeTabId)?.ptyId;
      if (ptyId) {
        api.ptySend(ptyId, `${cmd}\n`).catch(() => undefined);
      }
    },
    [store],
  );

  const handlePasteExecute = useCallback(
    (content: string) => {
      const ptyId = store.tabs.find((t) => t.id === store.activeTabId)?.ptyId;
      if (ptyId) {
        api.ptySend(ptyId, content).catch(() => undefined);
      }
      setPasteCheckResult(null);
    },
    [store],
  );

  const handlePasteCancel = useCallback(() => {
    setPasteCheckResult(null);
  }, []);

  const closeCurrentTab = useCallback(() => {
    const { activeTabId } = store;
    if (activeTabId) {
      store.closeTab(activeTabId).catch(() => undefined);
    }
  }, [store]);

  const nextTab = useCallback(() => {
    const { tabs, activeTabId } = store;
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (idx + 1) % tabs.length;
    store.setActiveTab(tabs[nextIdx].id);
  }, [store]);

  const prevTab = useCallback(() => {
    const { tabs, activeTabId } = store;
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prevIdx = (idx - 1 + tabs.length) % tabs.length;
    store.setActiveTab(tabs[prevIdx].id);
  }, [store]);

  // 创建稳定的 handlers 对象引用
  const shortcutHandlers = useMemo(
    () => ({
      newSession: newTempConnection,
      commandPalette: openCommandPalette,
      toggleSidebar,
      closeTab: closeCurrentTab,
      nextTab,
      prevTab,
      newTab: addConnection,
      openSettings,
      copy: copySelection,
      terminalSearch: toggleSearch,
      commandHistory: openCommandHistory,
    }),
    [newTempConnection, openCommandPalette, toggleSidebar, closeCurrentTab, nextTab, prevTab, addConnection, openSettings, copySelection, toggleSearch, openCommandHistory],
  );

  useShortcuts(store.settings?.shortcuts, shortcutHandlers);

  // 使用 key 强制在切换时重新挂载 Sidebar
  const sidebarKey = sidebarCollapsed ? "collapsed" : "expanded";

  return (
    <div className="h-full w-full flex bg-[var(--color-gray-950)] text-white overflow-hidden">
      <ErrorBoundary>
        <Sidebar
          key={sidebarKey}
          groups={store.groups}
          sessions={store.sessions}
          activeSessionIds={activeSessionIds}
          collapsed={sidebarCollapsed}
          layoutMode={store.settings?.layoutMode ?? "compact"}
          lang={lang}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onGroupNew={() => {
            setGroupNameModal({ mode: "new", groupId: null, initial: "" });
            setGroupNameValue("");
          }}
          onGroupRename={(id) => {
            const g = store.groups.find((x) => x.id === id);
            if (!g) return;
            setGroupNameModal({ mode: "rename", groupId: g.id, initial: g.name });
            setGroupNameValue(g.name);
          }}
          onGroupDelete={(id) => {
            const g = store.groups.find((x) => x.id === id);
            if (!g) return;
            if (!window.confirm(tf(lang, "confirmDeleteGroup", { name: g.name }))) return;
            store.deleteGroup(g.id).catch(() => undefined);
          }}
          onGroupReorder={(ids) => store.reorderGroups(ids).catch(() => undefined)}
          onNew={() => {
            setEditingSession(null);
            setEditorOpen(true);
          }}
          onEdit={(id) => {
            const s = store.sessions.find((x) => x.id === id) ?? null;
            setEditingSession(s);
            setEditorOpen(true);
          }}
          onDelete={(id) => {
            if (!window.confirm(t(lang, "confirmDeleteSession"))) return;
            store.deleteSession(id).catch(() => undefined);
          }}
          onOpen={(id) => {
            store.openSessionTab(id).catch(() => undefined);
          }}
          onToggleFavorite={(id) => {
            store.toggleFavorite(id).catch(() => undefined);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onMoveSessionToGroup={(sessionId, groupId) =>
            store.moveSessionToGroup(sessionId, groupId).catch(() => undefined)
          }
          onReorderSessionsInGroup={(groupId, sessionIds) =>
            store.reorderSessionsInGroup(groupId, sessionIds).catch(() => undefined)
          }
        />
      </ErrorBoundary>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <TabBar
          tabs={store.tabs}
          activeTabId={store.activeTabId}
          onReorder={(ids) => store.reorderTabs(ids)}
          onSelect={(id) => store.setActiveTab(id)}
          onClose={(id) => store.closeTab(id).catch(() => undefined)}
          onNewSession={() => {
            setTempEditorOpen(true);
          }}
          onDuplicateTab={(tabId) => {
            store.duplicateTab(tabId, lastTermSize.cols, lastTermSize.rows).catch(() => undefined);
          }}
          layoutMode={layoutMode}
          newSessionTitle={t(lang, "tempConnection")}
          duplicateLabel={t(lang, "tabDuplicate")}
          closeLabel={t(lang, "tabClose")}
        />

        <div className="flex-1 min-h-0">
          {activeTab ? (
            activeTab.split ? (
              <PanelGroup direction={activeTab.splitDirection ?? "horizontal"} className="h-full">
                <Panel defaultSize={75} minSize={30} className="flex flex-col">
                  <div className={[
                    "h-9 bg-[var(--color-gray-900)] border-b border-[var(--color-gray-800)] flex items-center gap-2 px-2 shrink-0"
                  ].join(" ")}>
                    <button
                      disabled={!activeTab}
                      onClick={async () => {
                        if (!activeTab) return;
                        dbg("info", "ui.connect:click", {
                          tabId: activeTab.id,
                          sessionId: activeTab.sessionId,
                          cols: lastTermSize.cols,
                          rows: lastTermSize.rows,
                          isTauri,
                        });
                        if (!isTauri) {
                          setConnectError(`${t(lang, "previewModeCannotConnect")}\n${t(lang, "useDesktopRun")}`);
                          return;
                        }
                        try {
                          if (activeTab.ptyId) {
                            await store.disconnectTab(activeTab.id);
                          } else {
                            await store.connectTab(activeTab.id, lastTermSize.cols, lastTermSize.rows);
                          }
                        } catch (e: any) {
                          dbg("error", "ui.connect:failed", { tabId: activeTab.id, message: String(e?.message ?? e ?? t(lang, "connectionFailed")) });
                          setConnectError(String(e?.message ?? e ?? t(lang, "connectionFailed")));
                        }
                      }}
                      className={[
                        "px-2 py-1 rounded text-xs flex items-center gap-1.5",
                        activeTab
                          ? activeTab.ptyId
                            ? "bg-[var(--color-gray-800)] text-[var(--color-gray-200)] hover:bg-[var(--color-gray-700)]"
                            : "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]"
                          : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
                      ].join(" ")}
                    >
                      <PlugZap className="size-3.5" />
                      {activeTab?.ptyId ? t(lang, "disconnect") : t(lang, "connect")}
                    </button>

                    <select
                      value=""
                      disabled={!activeTab?.ptyId}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        e.currentTarget.value = "";
                        if (!v) return;
                        const ptyId = activeTab?.ptyId;
                        if (!ptyId) return;
                        dbg("info", "ui.quick_cmd:run", { tabId: activeTab.id, cmd: v });
                        api.ptySend(ptyId, `${v}\n`).catch(() => undefined);
                      }}
                      className={[
                        "h-7 px-2 rounded text-xs bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-[var(--color-gray-300)]",
                        !activeTab?.ptyId ? "opacity-50" : "hover:border-[var(--color-gray-600)]",
                      ].join(" ")}
                    >
                      <option value="" disabled>
                        {t(lang, "quickCommands")}
                      </option>
                      {(store.settings?.commonCommands?.length ? store.settings.commonCommands : getDefaultCommonCommands(lang)).map((c) => (
                        <option key={c.id} value={c.command}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex-1" />

                    {activeSession ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={["size-2 rounded-full", activeTab?.ptyId ? "bg-emerald-500" : "bg-[var(--color-gray-700)]"].join(" ")} />
                        <div className="text-xs text-[var(--color-gray-300)] truncate">{activeSession.name || activeTab?.title}</div>
                        <div className="text-xs text-[var(--color-gray-600)] truncate">{activeSession.username}@{activeSession.host}:{activeSession.port}</div>
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--color-gray-500)] truncate">{activeTab ? activeTab.title : t(lang, "noTabs")}</div>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <TerminalSearchBar
                      searchAddon={searchAddonRef.current}
                      visible={searchVisible}
                      onClose={() => setSearchVisible(false)}
                      lang={lang}
                    />
                    <div className="flex-1 min-h-0">
                      {store.tabs.map((t) => (
                        <div key={t.id} className="w-full h-full" style={{ display: t.id === activeTab.id ? "block" : "none" }}>
                          <TerminalView
                            ptyId={t.ptyId}
                            visible={t.id === activeTab.id}
                            settings={
                              store.settings ?? {
                                theme: "github-dark",
                                fontFamily: "Consolas",
                                fontSize: 14,
                                lineHeight: 1.2,
                                language: "zh-CN",
                                layoutMode: "compact",
                                shortcuts: DEFAULT_SHORTCUTS,
                                commonCommands: DEFAULT_COMMON_COMMANDS,
                              }
                            }
                            onSize={
                              t.id === activeTab.id
                                ? (cols, rows) => {
                                    setLastTermSize({ cols, rows });
                                    if (t.ptyId) api.ptyResize(t.ptyId, cols, rows).catch(() => undefined);
                                  }
                                : undefined
                            }
                            onSearchAddon={(addon) => {
                              if (t.id === activeTab?.id) searchAddonRef.current = addon;
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle
                  className={[
                    activeTab.splitDirection === "vertical" ? "h-1" : "w-1",
                    "bg-[var(--color-gray-800)] hover:bg-[var(--color-blue-600)] transition-colors",
                  ].join(" ")}
                />
                <Panel defaultSize={25} minSize={25} className="flex flex-col">
                  <SftpPanel
                    ptyId={activeTab.sftpPtyId}
                    splitDirection={activeTab.splitDirection}
                    lang={lang}
                    onToggleSplitDirection={() => {
                      useAppStore.setState({
                        tabs: store.tabs.map((t) =>
                          t.id === activeTab.id ? { ...t, splitDirection: (t.splitDirection ?? "horizontal") === "horizontal" ? "vertical" : "horizontal" } : t,
                        ),
                      });
                    }}
                    onClose={() => store.closeSftp(activeTab.id).catch(() => undefined)}
                  />
                </Panel>
              </PanelGroup>
            ) : (
              <div className="flex flex-col w-full h-full">
                <div className={[
                  "h-9 bg-[var(--color-gray-900)] border-b border-[var(--color-gray-800)] flex items-center gap-2 px-2"
                ].join(" ")}>
                  <button
                    disabled={!activeTab}
                    onClick={async () => {
                      if (!activeTab) return;
                      dbg("info", "ui.connect:click", {
                        tabId: activeTab.id,
                        sessionId: activeTab.sessionId,
                        cols: lastTermSize.cols,
                        rows: lastTermSize.rows,
                        isTauri,
                      });
                      if (!isTauri) {
                        setConnectError(`${t(lang, "previewModeCannotConnect")}\n${t(lang, "useDesktopRun")}`);
                        return;
                      }
                      try {
                        if (activeTab.ptyId) {
                          await store.disconnectTab(activeTab.id);
                        } else {
                          await store.connectTab(activeTab.id, lastTermSize.cols, lastTermSize.rows);
                        }
                      } catch (e: any) {
                        dbg("error", "ui.connect:failed", { tabId: activeTab.id, message: String(e?.message ?? e ?? t(lang, "connectionFailed")) });
                        setConnectError(String(e?.message ?? e ?? t(lang, "connectionFailed")));
                      }
                    }}
                    className={[
                      "px-2 py-1 rounded text-xs flex items-center gap-1.5",
                      activeTab
                        ? activeTab.ptyId
                          ? "bg-[var(--color-gray-800)] text-[var(--color-gray-200)] hover:bg-[var(--color-gray-700)]"
                          : "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]"
                        : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
                    ].join(" ")}
                  >
                    <PlugZap className="size-3.5" />
                    {activeTab?.ptyId ? t(lang, "disconnect") : t(lang, "connect")}
                  </button>

                  <button
                    disabled={!activeTab}
                    onClick={async () => {
                      if (!activeTab) return;
                      dbg("info", "ui.sftp:click", { tabId: activeTab.id, sessionId: activeTab.sessionId, isTauri });
                      if (!isTauri) {
                        setConnectError(`${t(lang, "previewModeCannotConnect")}\n${t(lang, "useDesktopRun")}`);
                        return;
                      }
                      try {
                        await store.openSftp(activeTab.id, lastTermSize.cols, lastTermSize.rows);
                      } catch (e: any) {
                        dbg("error", "ui.sftp:failed", { tabId: activeTab.id, message: String(e?.message ?? e ?? t(lang, "openSftpFailed")) });
                        setConnectError(String(e?.message ?? e ?? t(lang, "openSftpFailed")));
                      }
                    }}
                    className={[
                      "px-2 py-1 rounded text-xs flex items-center gap-1.5",
                      activeTab?.sftpPtyId ? "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]" : activeTab ? "bg-[var(--color-gray-800)] text-[var(--color-gray-400)] hover:bg-[var(--color-gray-700)]" : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
                    ].join(" ")}
                  >
                    <Folder className="size-3.5" />
                    SFTP
                  </button>

                  {/* Temporarily hidden - requires SSH key auth */}
                  <button
                    disabled={true}
                    style={{ display: 'none' }}
                    className={[
                      "px-2 py-1 rounded text-xs flex items-center gap-1.5",
                      activeTab?.ptyId ? "bg-[var(--color-gray-800)] text-[var(--color-gray-400)] hover:bg-[var(--color-gray-700)]" : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
                    ].join(" ")}
                  >
                    <Activity className="size-3.5" />
                    {t(lang, "monitor")}
                  </button>

                  <select
                    value=""
                    disabled={!activeTab?.ptyId}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      e.currentTarget.value = "";
                      if (!v) return;
                      const ptyId = activeTab?.ptyId;
                      if (!ptyId) return;
                      dbg("info", "ui.quick_cmd:run", { tabId: activeTab.id, cmd: v });
                      api.ptySend(ptyId, `${v}\n`).catch(() => undefined);
                    }}
                    className={[
                      "h-7 px-2 rounded text-xs bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-[var(--color-gray-300)]",
                      !activeTab?.ptyId ? "opacity-50" : "hover:border-[var(--color-gray-600)]",
                    ].join(" ")}
                  >
                    <option value="" disabled>
                      {t(lang, "quickCommands")}
                    </option>
                    {(store.settings?.commonCommands?.length ? store.settings.commonCommands : getDefaultCommonCommands(lang)).map((c) => (
                      <option key={c.id} value={c.command}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex-1" />

                  {activeSession ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={["size-2 rounded-full", activeTab?.ptyId ? "bg-emerald-500" : "bg-[var(--color-gray-700)]"].join(" ")} />
                      <div className="text-xs text-[var(--color-gray-300)] truncate">{activeSession.name || activeTab?.title}</div>
                      <div className="text-xs text-[var(--color-gray-600)] truncate">{activeSession.username}@{activeSession.host}:{activeSession.port}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--color-gray-500)] truncate">{activeTab ? activeTab.title : t(lang, "noTabs")}</div>
                  )}
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <TerminalSearchBar
                    searchAddon={searchAddonRef.current}
                    visible={searchVisible}
                    onClose={() => setSearchVisible(false)}
                    lang={lang}
                  />
                  <div className="flex-1 min-h-0">
                    {store.tabs.map((t) => (
                      <div key={t.id} className="w-full h-full" style={{ display: t.id === activeTab.id ? "block" : "none" }}>
                        <TerminalView
                          ptyId={t.ptyId}
                          visible={t.id === activeTab.id}
                          onTerminal={(term) => {
                            if (t.id !== activeTab.id) return;
                            activeTermRef.current = term;
                          }}
                          settings={
                            store.settings ?? {
                              theme: "github-dark",
                              fontFamily: "Consolas",
                              fontSize: 14,
                              lineHeight: 1.2,
                              language: "zh-CN",
                              layoutMode: "compact",
                              shortcuts: DEFAULT_SHORTCUTS,
                              commonCommands: DEFAULT_COMMON_COMMANDS,
                            }
                          }
                          onSize={
                            t.id === activeTab.id
                              ? (cols, rows) => {
                                  setLastTermSize({ cols, rows });
                                  if (t.ptyId) api.ptyResize(t.ptyId, cols, rows).catch(() => undefined);
                                }
                              : undefined
                          }
                          onSearchAddon={(addon) => {
                            if (t.id === activeTab?.id) searchAddonRef.current = addon;
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="h-full flex items-center justify-center text-[var(--color-gray-500)]">
              <div className="text-center">
                <div className="text-4xl mb-2">🖥️</div>
                <div className="text-sm">{t(lang, "noOpenSession")}</div>
                <div className="text-xs mt-1">{t(lang, "doubleClickToOpen")}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <SessionEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        groups={store.groups}
        session={editingSession}
        lang={lang}
        onSubmit={(input) => store.upsertSession(input as any)}
      />

      <SessionEditor
        open={tempEditorOpen}
        onClose={() => setTempEditorOpen(false)}
        groups={store.groups}
        session={null}
        lang={lang}
        titleOverride={t(lang, "tempConnection")}
        submitLabel={t(lang, "connect")}
        hidePersistenceFields
        onSubmit={(input) => store.openTempTab(input as any)}
      />

      <Modal
        title={t(lang, "commandPaletteTitle")}
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        footer={null}
      >
        <CommandPaletteBody
          lang={lang}
          query={commandPaletteQuery}
          setQuery={setCommandPaletteQuery}
          activeIndex={commandPaletteActiveIndex}
          setActiveIndex={setCommandPaletteActiveIndex}
          onClose={() => setCommandPaletteOpen(false)}
          actions={[
            { id: "newTemp", label: t(lang, "tempConnection"), run: newTempConnection },
            { id: "addConn", label: t(lang, "addConnection"), run: addConnection },
            { id: "settings", label: t(lang, "settings"), run: openSettings },
            { id: "toggleSidebar", label: t(lang, "shortcutToggleSidebar"), run: toggleSidebar },
            { id: "closeTab", label: t(lang, "shortcutCloseTab"), run: closeCurrentTab },
            { id: "nextTab", label: t(lang, "shortcutNextTab"), run: nextTab },
            { id: "prevTab", label: t(lang, "shortcutPrevTab"), run: prevTab },
          ]}
        />
      </Modal>

      <Modal
        title={groupNameModal?.mode === "rename" ? t(lang, "promptRenameGroup") : t(lang, "promptNewGroupName")}
        open={!!groupNameModal}
        onClose={() => setGroupNameModal(null)}
        footer={
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1.5 rounded bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)]"
              onClick={() => setGroupNameModal(null)}
            >
              {t(lang, "cancel")}
            </button>
            <button
              className="px-3 py-1.5 rounded bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]"
              onClick={() => {
                if (!groupNameModal) return;
                const name = groupNameValue.trim();
                if (!name) return;
                if (groupNameModal.mode === "new") {
                  const maxSort = Math.max(0, ...store.groups.map((g) => g.sortIndex ?? 0));
                  store.upsertGroup({ id: null, name, sortIndex: maxSort + 100 }).catch(() => undefined);
                } else {
                  const g = store.groups.find((x) => x.id === groupNameModal.groupId);
                  if (!g || name === g.name) { setGroupNameModal(null); return; }
                  store.upsertGroup({ id: g.id, name, sortIndex: g.sortIndex }).catch(() => undefined);
                }
                setGroupNameModal(null);
              }}
            >
              {t(lang, "confirm")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <GroupNameModal
            data={groupNameModal}
            value={groupNameValue}
            onClose={() => setGroupNameModal(null)}
            onSubmit={(name) => {
              if (!groupNameModal) return;
              if (groupNameModal.mode === "new") {
                const maxSort = Math.max(0, ...store.groups.map((g) => g.sortIndex ?? 0));
                store.upsertGroup({ id: null, name, sortIndex: maxSort + 100 }).catch(() => undefined);
              } else {
                const g = store.groups.find((x) => x.id === groupNameModal.groupId);
                if (!g) return;
                store.upsertGroup({ id: g.id, name, sortIndex: g.sortIndex }).catch(() => undefined);
              }
              setGroupNameModal(null);
            }}
            onValueChange={setGroupNameValue}
            groups={store.groups}
            lang={lang}
          />
        </div>
      </Modal>

      {store.settings ? (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={store.settings}
          onSave={async (s) => {
            await api.settingsSet(s);
            await store.refreshAll();
          }}
        />
      ) : null}

      <Modal
        title={t(lang, "hostKeyTitle")}
        open={!!store.hostKeyPrompt}
        onClose={() => store.clearPrompts()}
        footer={
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1.5 rounded bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)]"
              onClick={() => store.respondHostKey(false).catch(() => undefined)}
            >
              {t(lang, "reject")}
            </button>
            <button className="px-3 py-1.5 rounded bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]" onClick={() => store.respondHostKey(true).catch(() => undefined)}>
              {t(lang, "trustAndContinue")}
            </button>
          </div>
        }
      >
        <pre className="whitespace-pre-wrap text-xs text-[var(--color-gray-200)]">{store.hostKeyPrompt?.message}</pre>
      </Modal>

      <Modal
        title={store.authPrompt?.kind === "keyPassphrase" ? t(lang, "enterKeyPassphraseTitle") : t(lang, "enterPasswordTitle")}
        open={!!store.authPrompt}
        onClose={() => store.clearPrompts()}
        footer={null}
      >
        <AuthPrompt
          kind={store.authPrompt?.kind ?? "password"}
          lang={lang}
          onSubmit={(v) => store.provideAuth(v).catch(() => undefined)}
        />
      </Modal>

      <Modal
        title={t(lang, "connectHintTitle")}
        open={!!connectError}
        onClose={() => setConnectError(null)}
        footer={
          <div className="flex justify-end">
            <button
              className="px-3 py-1.5 rounded bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]"
              onClick={() => setConnectError(null)}
            >
              {t(lang, "ok")}
            </button>
          </div>
        }
      >
        <div className="text-sm text-[var(--color-gray-200)] whitespace-pre-wrap">{connectError}</div>
      </Modal>

      <CommandHistoryModal
        open={commandHistoryOpen}
        lang={lang}
        onSelect={handleCommandSelect}
        onClose={() => setCommandHistoryOpen(false)}
      />

      {pasteCheckResult && (
        <PasteConfirmDialog
          result={pasteCheckResult}
          lang={lang}
          onExecute={handlePasteExecute}
          onCancel={handlePasteCancel}
        />
      )}

      {monitorOpen && (
        <MonitorPanel
          ptyId={activeTab?.ptyId ?? null}
          sessionId={activeTab?.sessionId ?? null}
          open={monitorOpen}
          onClose={() => setMonitorOpen(false)}
          lang={lang}
        />
      )}

    </div>
  );
}

export default App;
