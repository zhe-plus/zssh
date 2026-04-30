import { useCallback, memo } from "react";
import { Folder, PlugZap } from "lucide-react";
import { dbg } from "../lib/debug";
import { t } from "../lib/i18n";
import { SYSTEM_COMMANDS } from "../lib/commandHistory";
import type { SessionPublic } from "../types";
import type { Tab } from "../store/appStore";

interface Size {
  cols: number;
  rows: number;
}

interface TerminalToolbarProps {
  activeTab: Tab | null;
  activeSession: SessionPublic | null;
  isTauri: boolean;
  lang: string;
  customCommands: { id: string; command: string; displayName?: string }[];
  recentHistory: { id: string; command: string }[];
  lastTermSize: Size;
  onConnectError: (error: string) => void;
  onRefresh: () => void;
  onConnectTab: (tabId: string, cols: number, rows: number) => Promise<void>;
  onDisconnectTab: (tabId: string) => Promise<void>;
  onOpenSftp: (tabId: string, cols: number, rows: number) => Promise<void>;
  onCloseSftp: (tabId: string) => Promise<void>;
  onSendCommand: (ptyId: string, command: string) => void;
}

function TerminalToolbarComponent({
  activeTab,
  activeSession,
  isTauri,
  lang,
  customCommands,
  recentHistory,
  lastTermSize,
  onConnectError,
  onRefresh,
  onConnectTab,
  onDisconnectTab,
  onOpenSftp,
  onCloseSftp,
  onSendCommand,
}: TerminalToolbarProps) {
  const handleConnectClick = useCallback(async () => {
    if (!activeTab) return;
    dbg("info", "ui.connect:click", {
      tabId: activeTab.id,
      sessionId: activeTab.sessionId,
      cols: lastTermSize.cols,
      rows: lastTermSize.rows,
      isTauri,
    });
    if (!isTauri) {
      onConnectError(`${t(lang, "previewModeCannotConnect")}\n${t(lang, "useDesktopRun")}`);
      return;
    }
    try {
      if (activeTab.ptyId) {
        await onDisconnectTab(activeTab.id);
      } else {
        await onConnectTab(activeTab.id, lastTermSize.cols, lastTermSize.rows);
      }
    } catch (e: any) {
      dbg("error", "ui.connect:failed", { tabId: activeTab.id, message: String(e?.message ?? e ?? t(lang, "connectionFailed")) });
      onConnectError(String(e?.message ?? e ?? t(lang, "connectionFailed")));
    }
  }, [activeTab, lastTermSize, isTauri, lang, onConnectError, onConnectTab, onDisconnectTab]);

  const handleSftpClick = useCallback(async () => {
    if (!activeTab) return;
    dbg("info", "ui.sftp:click", { tabId: activeTab.id, sessionId: activeTab.sessionId, sftpOpen: !!activeTab.sftpPtyId, isTauri });
    if (!isTauri) {
      onConnectError(`${t(lang, "previewModeCannotConnect")}\n${t(lang, "useDesktopRun")}`);
      return;
    }
    try {
      if (activeTab.sftpPtyId) {
        await onCloseSftp(activeTab.id);
      } else {
        await onOpenSftp(activeTab.id, lastTermSize.cols, lastTermSize.rows);
      }
    } catch (e: any) {
      dbg("error", "ui.sftp:failed", { tabId: activeTab.id, message: String(e?.message ?? e ?? t(lang, "openSftpFailed")) });
      onConnectError(String(e?.message ?? e ?? t(lang, "openSftpFailed")));
    }
  }, [activeTab, lastTermSize, isTauri, lang, onConnectError, onOpenSftp, onCloseSftp]);

  const handleQuickCommand = useCallback((command: string) => {
    const ptyId = activeTab?.ptyId;
    if (!ptyId) return;
    dbg("info", "ui.quick_cmd:run", { tabId: activeTab.id, cmd: command });
    onSendCommand(ptyId, `${command}\n`);
    onRefresh();
  }, [activeTab, onSendCommand, onRefresh]);

  return (
    <div className={[
      "h-9 bg-[var(--color-gray-900)] border-b border-[var(--color-gray-800)] flex items-center gap-2 px-2 shrink-0"
    ].join(" ")}>
      {/* 连接/断开按钮 */}
      <button
        disabled={!activeTab}
        onClick={handleConnectClick}
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

      {/* SFTP 按钮 */}
      <button
        disabled={!activeTab}
        onClick={handleSftpClick}
        className={[
          "px-2 py-1 rounded text-xs flex items-center gap-1.5",
          activeTab?.sftpPtyId ? "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]" : activeTab ? "bg-[var(--color-gray-800)] text-[var(--color-gray-400)] hover:bg-[var(--color-gray-700)]" : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
        ].join(" ")}
      >
        <Folder className="size-3.5" />
        SFTP
      </button>

      {/* 系统命令下拉框 */}
      <select
        value=""
        disabled={!activeTab?.ptyId}
        onChange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = "";
          if (v) handleQuickCommand(v);
        }}
        className={[
          "h-7 px-2 rounded text-xs bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-[var(--color-gray-300)] w-[88px]",
          !activeTab?.ptyId ? "opacity-50" : "hover:border-[var(--color-gray-600)]",
        ].join(" ")}
      >
        <option value="" disabled>
          系统命令
        </option>
        {SYSTEM_COMMANDS.map((c) => (
          <option key={c.id} value={c.command} title={c.command}>
            {t(lang, c.displayNameKey)}
          </option>
        ))}
      </select>

      {/* 自定义命令下拉框 */}
      <select
        value=""
        disabled={!activeTab?.ptyId}
        onChange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = "";
          if (v) handleQuickCommand(v);
        }}
        className={[
          "h-7 px-2 rounded text-xs bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-[var(--color-gray-300)] w-[88px]",
          !activeTab?.ptyId ? "opacity-50" : "hover:border-[var(--color-gray-600)]",
        ].join(" ")}
      >
        <option value="" disabled>
          自定义
        </option>
        {customCommands.map((c) => (
          <option key={c.id} value={c.command} title={c.command}>
            {c.displayName || c.command}
          </option>
        ))}
      </select>

      {/* 历史记录下拉框 */}
      <select
        value=""
        disabled={!activeTab?.ptyId}
        onChange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = "";
          if (v) handleQuickCommand(v);
        }}
        className={[
          "h-7 px-2 rounded text-xs bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-[var(--color-gray-300)] w-[88px]",
          !activeTab?.ptyId ? "opacity-50" : "hover:border-[var(--color-gray-600)]",
        ].join(" ")}
      >
        <option value="" disabled>
          历史记录
        </option>
        {recentHistory.map((c) => (
          <option key={c.id} value={c.command} title={c.command}>
            {c.command.slice(0, 30)}{c.command.length > 30 ? "..." : ""}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      {/* 会话信息 */}
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
  );
}

export const TerminalToolbar = memo(TerminalToolbarComponent);
