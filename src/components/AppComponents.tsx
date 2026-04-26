import { useEffect, useMemo, useState } from "react";
import { Folder, PlugZap } from "lucide-react";
import type { UUID } from "../types";
import { api } from "../api";
import { t } from "../lib/i18n";
import { getDefaultCommonCommands } from "../lib/defaultCommonCommands";

// ========================
// 终端工具栏（连接按钮 + 快捷命令 + 会话信息）
// ========================

interface TerminalToolbarProps {
  tab: { id: UUID; ptyId: UUID | null; sftpPtyId: UUID | null; splitDirection?: "horizontal" | "vertical" };
  session: { name: string; host: string; username: string; port: number } | null;
  lang: string;
  isTauri: boolean;
  lastTermSize: { cols: number; rows: number };
  onConnect: () => Promise<void>;
  onSftp?: () => Promise<void>;
}

export function TerminalToolbar(props: TerminalToolbarProps) {
  const { tab, session, lang } = props;
  return (
    <div className="h-9 bg-[var(--color-gray-900)] border-b border-[var(--color-gray-800)] flex items-center gap-2 px-2 shrink-0">
      <button disabled={!tab} onClick={props.onConnect} className={connectBtnClass(tab)}>
        <PlugZap className="size-3.5" />
        {tab?.ptyId ? t(lang, "disconnect") : t(lang, "connect")}
      </button>

      {props.onSftp && (
        <button
          disabled={!tab}
          onClick={props.onSftp}
          className={[
            "px-2 py-1 rounded text-xs flex items-center gap-1.5",
            tab.sftpPtyId ? "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]" : tab ? "bg-[var(--color-gray-800)] text-[var(--color-gray-400)] hover:bg-[var(--color-gray-700)]" : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
          ].join(" ")}
        >
          <Folder className="size-3.5" /> SFTP
        </button>
      )}

      <QuickCommandSelect ptyId={tab?.ptyId ?? null} lang={lang} />

      <div className="flex-1" />

      {session ? (
        <SessionInfo session={session} connected={!!tab?.ptyId} />
      ) : (
        <div className="text-xs text-[var(--color-gray-500)] truncate">{tab ? t(lang, "noSession") : t(lang, "noTabs")}</div>
      )}
    </div>
  );
}

/** 快捷命令下拉选择 */
function QuickCommandSelect({ ptyId, lang }: { ptyId: UUID | null; lang: string }) {
  // 通过全局 store 获取 settings（避免 prop drilling）
  // 这里用事件委托方式发送命令
  return (
    <select
      value=""
      disabled={!ptyId}
      onChange={(e) => {
        const v = e.currentTarget.value;
        e.currentTarget.value = "";
        if (!v || !ptyId) return;
        api.ptySend(ptyId, `${v}\n`).catch(() => undefined);
      }}
      className={[
        "h-7 px-2 rounded text-xs bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-[var(--color-gray-300)]",
        !ptyId ? "opacity-50" : "hover:border-[var(--color-gray-600)]",
      ].join(" ")}
    >
      <option value="" disabled>{t(lang, "quickCommands")}</option>
      {/* commonCommands 由父组件通过 context 或直接传入 */}
    </select>
  );
}

/** 带快捷命令选项的终端工具栏（需要传入 commands 列表） */
export function TerminalToolbarWithCommands(
  props: TerminalToolbarProps & { commonCommands: Array<{ id: string; command: string; name: string }> }
) {
  const { tab, session, lang, commonCommands } = props;
  return (
    <div className="h-9 bg-[var(--color-gray-900)] border-b border-[var(--color-gray-800)] flex items-center gap-2 px-2 shrink-0">
      <button disabled={!tab} onClick={props.onConnect} className={connectBtnClass(tab)}>
        <PlugZap className="size-3.5" />
        {tab?.ptyId ? t(lang, "disconnect") : t(lang, "connect")}
      </button>

      {props.onSftp && (
        <button
          disabled={!tab}
          onClick={props.onSftp}
          className={[
            "px-2 py-1 rounded text-xs flex items-center gap-1.5",
            tab.sftpPtyId ? "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]" : tab ? "bg-[var(--color-gray-800)] text-[var(--color-gray-400)] hover:bg-[var(--color-gray-700)]" : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
          ].join(" ")}
        >
          <Folder className="size-3.5" /> SFTP
        </button>
      )}

      <select
        value=""
        disabled={!tab?.ptyId}
        onChange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = "";
          if (!v || !tab?.ptyId) return;
          api.ptySend(tab.ptyId, `${v}\n`).catch(() => undefined);
        }}
        className={[
          "h-7 px-2 rounded text-xs bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-[var(--color-gray-300)]",
          !tab?.ptyId ? "opacity-50" : "hover:border-[var(--color-gray-600)]",
        ].join(" ")}
      >
        <option value="" disabled>{t(lang, "quickCommands")}</option>
        {(commonCommands.length > 0 ? commonCommands : getDefaultCommonCommands(lang)).map((c) => (
          <option key={c.id} value={c.command}>{c.name}</option>
        ))}
      </select>

      <div className="flex-1" />

      {session ? (
        <SessionInfo session={session} connected={!!tab?.ptyId} />
      ) : (
        <div className="text-xs text-[var(--color-gray-500)] truncate">{t(lang, "noTabs")}</div>
      )}
    </div>
  );
}

function connectBtnClass(tab: { ptyId: UUID | null } | undefined): string {
  return [
    "px-2 py-1 rounded text-xs flex items-center gap-1.5",
    tab
      ? tab.ptyId
        ? "bg-[var(--color-gray-800)] text-[var(--color-gray-200)] hover:bg-[var(--color-gray-700)]"
        : "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]"
      : "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]",
  ].join(" ");
}

function SessionInfo({ session, connected }: { session: { name: string; host: string; username: string; port: number }; connected: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-[var(--color-gray-700)]"}`} />
      <div className="text-xs text-[var(--color-gray-300)] truncate">{session.name}</div>
      <div className="text-xs text-[var(--color-gray-600)] truncate">{session.username}@{session.host}:{session.port}</div>
    </div>
  );
}

// ========================
// 分组名称弹窗
// ========================

export interface GroupNameModalData {
  mode: "new" | "rename";
  groupId: UUID | null;
  initial: string;
}

interface GroupNameModalProps {
  data: GroupNameModalData | null;
  value: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
  onValueChange: (v: string) => void;
  groups: Array<{ id: UUID; name: string; sortIndex?: number }>;
  lang: string;
}

export function GroupNameModal(props: GroupNameModalProps) {
  if (!props.data) return null;

  const handleSubmit = () => {
    const name = props.value.trim();
    if (!name) return;
    if (props.data!.mode === "rename") {
      const g = props.groups.find((x) => x.id === props.data!.groupId);
      if (g && name === g.name) { props.onClose(); return; }
    }
    props.onSubmit(name);
  };

  return (
    <>
      <div className="text-xs text-[var(--color-gray-500)]">{t(props.lang, "groupName")}</div>
      <input
        autoFocus
        value={props.value}
        onChange={(e) => props.onValueChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); props.onClose(); return; }
          if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
        }}
        className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
      />
    </>
  );
}

// ========================
// 认证输入弹窗
// ========================

export function AuthPrompt(props: { kind: "password" | "keyPassphrase"; lang: string; onSubmit: (value: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <input
        type="password"
        autoFocus
        value={v}
        onChange={(e) => setV(e.currentTarget.value)}
        placeholder={props.kind === "keyPassphrase" ? t(props.lang, "enterKeyPassphrase") : t(props.lang, "enterPassword")}
        className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
      />
      <div className="flex justify-end">
        <button
          className="px-4 py-2 bg-[var(--color-blue-600)] text-white rounded hover:bg-[var(--color-blue-700)]"
          onClick={() => { props.onSubmit(v); setV(""); }}
        >
          {t(props.lang, "confirm")}
        </button>
      </div>
    </div>
  );
}

// ========================
// 命令面板
// ========================

export function CommandPaletteBody(props: {
  lang: string;
  query: string;
  setQuery: (v: string) => void;
  activeIndex: number;
  setActiveIndex: (v: number) => void;
  onClose: () => void;
  actions: Array<{ id: string; label: string; run: () => void }>;
}) {
  const list = useMemo(() => {
    const q = props.query.trim().toLowerCase();
    if (!q) return props.actions;
    return props.actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [props.query, props.actions]);

  useEffect(() => {
    if (props.activeIndex < 0) props.setActiveIndex(0);
    else if (props.activeIndex >= list.length) props.setActiveIndex(Math.max(0, list.length - 1));
  }, [props.activeIndex, list.length]);

  const runActive = () => {
    const item = list[props.activeIndex];
    if (!item) return;
    props.onClose();
    item.run();
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        value={props.query}
        onChange={(e) => props.setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); props.onClose(); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); props.setActiveIndex(Math.min(props.activeIndex + 1, list.length - 1)); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); props.setActiveIndex(Math.max(props.activeIndex - 1, 0)); return; }
          if (e.key === "Enter") { e.preventDefault(); runActive(); }
        }}
        placeholder={t(props.lang, "commandPalettePlaceholder")}
        className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
      />
      <div className="border border-[var(--color-gray-800)] rounded overflow-hidden">
        {list.map((a, idx) => (
          <button
            key={a.id}
            onClick={() => { props.onClose(); a.run(); }}
            className={[
              "w-full text-left px-3 py-2 text-sm",
              idx === props.activeIndex ? "bg-[var(--color-gray-800)] text-white" : "bg-[var(--color-gray-900)] text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)]",
            ].join(" ")}
          >{a.label}</button>
        ))}
        {list.length === 0 ? <div className="px-3 py-3 text-sm text-[var(--color-gray-500)]">{t(props.lang, "commandPaletteNoResults")}</div> : null}
      </div>
    </div>
  );
}
