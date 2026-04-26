import { useEffect, useMemo, useState } from "react";
import type { CommonCommand, Settings } from "../types";
import { Modal } from "./Modal";
import { Check, FileJson, Globe, Keyboard, Layout, Palette, Terminal, Search } from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { useAppStore } from "../store/appStore";
import { t } from "../lib/i18n";
import { isCompactLayout } from "../lib/layout";
import { DEFAULT_SHORTCUTS } from "../lib/defaultShortcuts";
import {
  SYSTEM_COMMANDS,
  getCustomCommands,
  getDisabledSystemCommands,
  toggleSystemCommandDisabled,
  resetSystemCommands,
  addCustomCommand,
  updateCustomCommand,
  deleteCustomCommand,
  clearCustomCommands,
  searchHistory,
  clearHistory,
  type CommandItem,
} from "../lib/commandHistory";

export function SettingsModal(props: { open: boolean; onClose: () => void; settings: Settings; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState<Settings>(props.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"theme" | "language" | "layout" | "shortcuts" | "commandManager" | "importExport">("theme");

  // 命令管理相关状态
  const [cmdTab, setCmdTab] = useState<"system" | "custom" | "history">("system");
  const [customCmds, setCustomCmds] = useState<CommandItem[]>([]);
  const [historyList, setHistoryList] = useState<CommandItem[]>([]);
  const [disabledSys, setDisabledSys] = useState<Set<string>>(new Set());
  const [cmdSearch, setCmdSearch] = useState("");

  // 加载命令数据
  useEffect(() => {
    if (tab !== "commandManager") return;
    setCustomCmds(getCustomCommands());
    setHistoryList(searchHistory("", 100));
    setDisabledSys(getDisabledSystemCommands());
  }, [tab]);

  useEffect(() => {
    if (!props.open) return;
    setS(props.settings);
    setError(null);
    setTab("theme");
  }, [props.open, props.settings]);

  const lang = s.language ?? "zh-CN";
  const isCompact = isCompactLayout(s.layoutMode);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await props.onSave(s);
      props.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const themes = useMemo(() => {
    const nameKey: Record<string, Parameters<typeof t>[1]> = {
      dark: "themeDarkDefault",
      monokai: "themeMonokai",
      "solarized-dark": "themeSolarizedDark",
      dracula: "themeDracula",
      nord: "themeNord",
      "github-dark": "themeGithubDark",
      "one-dark": "themeOneDark",
      "tokyo-night": "themeTokyoNight",
      material: "themeMaterial",
      cobalt: "themeCobalt",
    };
    return [
      { id: "dark", name: t(lang, nameKey["dark"]!), preview: { bg: "#0a0a0a", terminal: "#1e1e1e", accent: "#3b82f6" } },
      { id: "monokai", name: t(lang, nameKey["monokai"]!), preview: { bg: "#272822", terminal: "#1e1e1e", accent: "#a6e22e" } },
      { id: "solarized-dark", name: t(lang, nameKey["solarized-dark"]!), preview: { bg: "#002b36", terminal: "#073642", accent: "#268bd2" } },
      { id: "dracula", name: t(lang, nameKey["dracula"]!), preview: { bg: "#282a36", terminal: "#1e1f29", accent: "#bd93f9" } },
      { id: "nord", name: t(lang, nameKey["nord"]!), preview: { bg: "#2e3440", terminal: "#3b4252", accent: "#88c0d0" } },
      { id: "github-dark", name: t(lang, nameKey["github-dark"]!), preview: { bg: "#0d1117", terminal: "#161b22", accent: "#58a6ff" } },
      { id: "one-dark", name: t(lang, nameKey["one-dark"]!), preview: { bg: "#282c34", terminal: "#21252b", accent: "#61afef" } },
      { id: "tokyo-night", name: t(lang, nameKey["tokyo-night"]!), preview: { bg: "#1a1b26", terminal: "#24283b", accent: "#7aa2f7" } },
      { id: "material", name: t(lang, nameKey["material"]!), preview: { bg: "#263238", terminal: "#1e272e", accent: "#82aaff" } },
      { id: "cobalt", name: t(lang, nameKey["cobalt"]!), preview: { bg: "#002240", terminal: "#193549", accent: "#0088ff" } },
    ];
  }, [lang]);

  const languageOptions = useMemo(
    () => [
      { id: "zh-CN", title: t(lang, "languageZhCN"), subtitle: "简体中文" },
      { id: "zh-TW", title: t(lang, "languageZhTW"), subtitle: "繁體中文" },
      { id: "en-US", title: t(lang, "languageEnUS"), subtitle: "English" },
    ],
    [lang],
  );

  const layoutOptions = useMemo(
    () => [
      { id: "compact", title: "紧凑型布局", subtitle: "更小的间距和元素，适合小屏幕或追求效率" },
      { id: "comfortable", title: "正常布局", subtitle: "标准间距和元素大小，视觉更舒适" },
    ],
    [],
  );

  async function doExport(includeSensitive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const path = await saveDialog({
        title: t(lang, "exportConfig"),
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "zssh-config.json",
      });
      if (!path) return;
      await api.configExportToPath(includeSensitive, path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doImport(mode: "merge" | "replace") {
    setBusy(true);
    setError(null);
    try {
      const path = await openDialog({
        title: t(lang, "importConfig"),
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!path || Array.isArray(path)) return;
      await api.configImportFromPath(path, mode);
      await useAppStore.getState().refreshAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // 命令管理函数
  function handleToggleSysCmd(id: string) {
    const newDisabled = new Set(disabledSys);
    if (newDisabled.has(id)) {
      newDisabled.delete(id);
    } else {
      newDisabled.add(id);
    }
    toggleSystemCommandDisabled(id, !disabledSys.has(id));
    setDisabledSys(newDisabled);
  }

  function handleResetSysCmds() {
    resetSystemCommands();
    setDisabledSys(new Set());
  }

  function handleAddCustomCmd() {
    addCustomCommand("", "");
    setCustomCmds(getCustomCommands());
  }

  function handleUpdateCustomCmd(id: string, command: string, displayName?: string) {
    updateCustomCommand(id, { command, displayName });
    setCustomCmds(getCustomCommands());
  }

  function handleDeleteCustomCmd(id: string) {
    deleteCustomCommand(id);
    setCustomCmds(getCustomCommands());
  }

  function handleClearCustomCmds() {
    if (window.confirm(t(lang, "confirmClearCustomCommands"))) {
      clearCustomCommands();
      setCustomCmds([]);
    }
  }

  function handleClearHistory() {
    if (window.confirm(t(lang, "confirmClearHistory"))) {
      clearHistory();
      setHistoryList([]);
    }
  }

  function handleSearchHistory() {
    setHistoryList(searchHistory(cmdSearch, 100));
  }

  // 过滤后的系统命令
  const filteredSysCmds = useMemo(() => {
    if (!cmdSearch) return SYSTEM_COMMANDS;
    const q = cmdSearch.toLowerCase();
    return SYSTEM_COMMANDS.filter(c => c.command.toLowerCase().includes(q));
  }, [cmdSearch]);

  // 过滤后的自定义命令
  const filteredCustomCmds = useMemo(() => {
    if (!cmdSearch) return customCmds;
    const q = cmdSearch.toLowerCase();
    return customCmds.filter(c =>
      c.command.toLowerCase().includes(q) ||
      c.displayName?.toLowerCase().includes(q)
    );
  }, [cmdSearch, customCmds]);

  const shortcutLabels: Record<string, string> = useMemo(
    () => ({
      newSession: t(lang, "shortcutNewSession"),
      commandPalette: t(lang, "shortcutCommandPalette"),
      toggleSidebar: t(lang, "shortcutToggleSidebar"),
      closeTab: t(lang, "shortcutCloseTab"),
      nextTab: t(lang, "shortcutNextTab"),
      prevTab: t(lang, "shortcutPrevTab"),
      newTab: t(lang, "shortcutNewTab"),
      openSettings: t(lang, "shortcutOpenSettings"),
      copy: t(lang, "shortcutCopy"),
    }),
    [lang],
  );

  const defaultShortcuts = DEFAULT_SHORTCUTS;

  return (
    <Modal
      title={t(lang, "settings")}
      open={props.open}
      onClose={() => {
        if (!busy) props.onClose();
      }}
      footer={
        <div className="flex gap-2 items-center">
          {error ? <div className="text-red-400 text-sm flex-1 truncate">{error}</div> : <div className="flex-1" />}
          <button
            disabled={busy}
            onClick={save}
            className={[
              isCompact ? "px-3 py-1.5 rounded text-sm" : "px-4 py-2 rounded text-sm",
              busy ? "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]" : "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]",
            ].join(" ")}
          >
            {t(lang, "done")}
          </button>
        </div>
      }
    >
      <div className={["border-b border-[var(--color-gray-800)] flex gap-1 px-1 overflow-x-auto", isCompact ? "mb-3" : "mb-4"].join(" ")}>
        {[
          { id: "theme", label: t(lang, "settingsTheme"), icon: <Palette className="size-4" /> },
          { id: "language", label: t(lang, "settingsLanguage"), icon: <Globe className="size-4" /> },
          { id: "layout", label: t(lang, "settingsLayout"), icon: <Layout className="size-4" /> },
          { id: "shortcuts", label: t(lang, "settingsShortcuts"), icon: <Keyboard className="size-4" /> },
          { id: "commandManager", label: t(lang, "commandManagerTitle"), icon: <Terminal className="size-4" /> },
          { id: "importExport", label: t(lang, "settingsImportExport"), icon: <FileJson className="size-4" /> },
        ].map((tabDef) => (
          <button
            key={tabDef.id}
            onClick={() => setTab(tabDef.id as typeof tab)}
            className={[
              "font-medium border-b-2 transition-colors whitespace-nowrap",
              isCompact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
              tab === tabDef.id
                ? "border-[var(--color-blue-500)] text-white"
                : "border-transparent text-[var(--color-gray-400)] hover:text-[var(--color-gray-300)]",
            ].join(" ")}
          >
            <div className={["flex items-center", isCompact ? "gap-1.5" : "gap-2"].join(" ")}>
              <span className={isCompact ? "hidden" : "inline-flex"}>{tabDef.icon}</span>
              {tabDef.label}
            </div>
          </button>
        ))}
      </div>

      {tab === "theme" ? (
        <div className={["flex flex-col", isCompact ? "gap-4" : "gap-6"].join(" ")}>
          <div>
            <div className={["font-medium text-[var(--color-gray-300)]", isCompact ? "text-xs mb-2" : "text-sm mb-4"].join(" ")}>{t(lang, "chooseTheme")}</div>
            <div className={["grid grid-cols-2", isCompact ? "gap-2" : "gap-4"].join(" ")}>
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setS({ ...s, theme: theme.id })}
                  className={[
                    "relative rounded-lg border-2 transition-all",
                    isCompact ? "p-3" : "p-4",
                    s.theme === theme.id
                      ? "border-[var(--color-blue-500)] bg-[var(--color-gray-800)]"
                      : "border-[var(--color-gray-700)] bg-[var(--color-gray-850)] hover:border-[var(--color-gray-600)]",
                  ].join(" ")}
                >
                  <div className={["rounded overflow-hidden flex", isCompact ? "mb-2 h-14" : "mb-3 h-20"].join(" ")}>
                    <div className="flex-1 flex flex-col">
                      <div className="flex-1" style={{ backgroundColor: theme.preview.bg }} />
                      <div className={["flex items-center px-2", isCompact ? "h-6" : "h-8"].join(" ")} style={{ backgroundColor: theme.preview.terminal }}>
                        <div className="w-16 h-1 rounded" style={{ backgroundColor: theme.preview.accent }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={[isCompact ? "text-xs" : "text-sm", "text-[var(--color-gray-200)]"].join(" ")}>{theme.name}</span>
                    {s.theme === theme.id ? (
                      <div className="size-5 rounded-full bg-[var(--color-blue-500)] flex items-center justify-center">
                        <Check className="size-3 text-white" />
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={["grid grid-cols-2", isCompact ? "gap-2" : "gap-3"].join(" ")}>
            <label className="flex flex-col gap-1.5">
              <div className={[isCompact ? "text-xs" : "text-sm", "text-[var(--color-gray-300)]"].join(" ")}>{t(lang, "fontFamily")}</div>
              <input
                value={s.fontFamily}
                onChange={(e) => setS({ ...s, fontFamily: e.currentTarget.value })}
                className={[
                  "w-full bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]",
                  isCompact ? "px-2.5 py-1.5 text-sm" : "px-3 py-2",
                ].join(" ")}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <div className={[isCompact ? "text-xs" : "text-sm", "text-[var(--color-gray-300)]"].join(" ")}>{t(lang, "fontSize")}</div>
              <input
                type="number"
                value={s.fontSize}
                onChange={(e) => setS({ ...s, fontSize: Number(e.currentTarget.value) })}
                className={[
                  "w-full bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white focus:outline-none focus:border-[var(--color-blue-500)]",
                  isCompact ? "px-2.5 py-1.5 text-sm" : "px-3 py-2",
                ].join(" ")}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <div className={[isCompact ? "text-xs" : "text-sm", "text-[var(--color-gray-300)]"].join(" ")}>{t(lang, "lineHeight")}</div>
              <input
                type="number"
                step="0.1"
                value={s.lineHeight}
                onChange={(e) => setS({ ...s, lineHeight: Number(e.currentTarget.value) })}
                className={[
                  "w-full bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white focus:outline-none focus:border-[var(--color-blue-500)]",
                  isCompact ? "px-2.5 py-1.5 text-sm" : "px-3 py-2",
                ].join(" ")}
              />
            </label>
          </div>
        </div>
      ) : null}

      {tab === "language" ? (
        <div className="flex flex-col gap-3">
          <div>
            <div className={["font-medium text-[var(--color-gray-300)]", isCompact ? "text-xs mb-2" : "text-sm mb-3"].join(" ")}>{t(lang, "chooseLanguage")}</div>
            <div className={["flex flex-col", isCompact ? "gap-2" : "gap-3"].join(" ")}>
              {languageOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setS({ ...s, language: opt.id })}
                  className={[
                    "relative rounded-lg border-2 transition-all flex items-center justify-between text-left",
                    isCompact ? "p-2.5" : "p-4",
                    s.language === opt.id
                      ? "border-[var(--color-blue-500)] bg-[var(--color-gray-800)]"
                      : "border-[var(--color-gray-700)] bg-[var(--color-gray-850)] hover:border-[var(--color-gray-600)]",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className={[isCompact ? "text-xs" : "text-sm", "text-[var(--color-gray-200)]"].join(" ")}>{opt.title}</div>
                    <div className={["text-[var(--color-gray-500)]", isCompact ? "text-[10px]" : "text-xs"].join(" ")}>{opt.subtitle}</div>
                  </div>
                  {s.language === opt.id ? (
                    <div className={["rounded-full bg-[var(--color-blue-500)] flex items-center justify-center", isCompact ? "size-4" : "size-6"].join(" ")}>
                      <Check className={isCompact ? "size-2.5 text-white" : "size-3.5 text-white"} />
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className={["bg-[var(--color-gray-800)] rounded-lg border border-[var(--color-gray-700)]", isCompact ? "p-2.5" : "p-4"].join(" ")}>
            <div className={["text-[var(--color-gray-500)]", isCompact ? "text-[10px]" : "text-xs"].join(" ")}>{t(lang, "currentLanguage")}</div>
            <div className={[isCompact ? "text-xs mt-0.5" : "text-sm mt-1", "text-[var(--color-gray-300)]"].join(" ")}>{s.language}</div>
          </div>
        </div>
      ) : null}

      {tab === "layout" ? (
        <div className="flex flex-col gap-3">
          <div>
            <div className={["font-medium text-[var(--color-gray-300)]", isCompact ? "text-xs mb-2" : "text-sm mb-3"].join(" ")}>{t(lang, "chooseLayout")}</div>
            <div className={["flex flex-col", isCompact ? "gap-2" : "gap-3"].join(" ")}>
              {layoutOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setS({ ...s, layoutMode: opt.id })}
                  className={[
                    "relative rounded-lg border-2 transition-all flex items-center justify-between text-left",
                    isCompact ? "p-2.5" : "p-4",
                    s.layoutMode === opt.id
                      ? "border-[var(--color-blue-500)] bg-[var(--color-gray-800)]"
                      : "border-[var(--color-gray-700)] bg-[var(--color-gray-850)] hover:border-[var(--color-gray-600)]",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className={[isCompact ? "text-xs" : "text-sm", "text-[var(--color-gray-200)]"].join(" ")}>{opt.id === "compact" ? t(lang, "layoutCompactTitle") : t(lang, "layoutComfortableTitle")}</div>
                    <div className={["text-[var(--color-gray-500)]", isCompact ? "text-[10px]" : "text-xs"].join(" ")}>{opt.id === "compact" ? t(lang, "layoutCompactSubtitle") : t(lang, "layoutComfortableSubtitle")}</div>
                  </div>
                  {s.layoutMode === opt.id ? (
                    <div className={["rounded-full bg-[var(--color-blue-500)] flex items-center justify-center", isCompact ? "size-4" : "size-6"].join(" ")}>
                      <Check className={isCompact ? "size-2.5 text-white" : "size-3.5 text-white"} />
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className={["bg-[var(--color-gray-800)] rounded-lg border border-[var(--color-gray-700)]", isCompact ? "p-2.5" : "p-4"].join(" ")}>
            <div className={["text-[var(--color-gray-500)]", isCompact ? "text-[10px]" : "text-xs"].join(" ")}>{t(lang, "currentLayout")}</div>
            <div className={[isCompact ? "text-xs mt-0.5" : "text-sm mt-1", "text-[var(--color-gray-300)]"].join(" ")}>{s.layoutMode === "compact" ? t(lang, "layoutCompactTitle") : t(lang, "layoutComfortableTitle")}</div>
          </div>
        </div>
      ) : null}

      {tab === "shortcuts" ? (
        <div className={["flex flex-col", isCompact ? "gap-2" : "gap-3"].join(" ")}>
          <div className="flex items-center justify-between">
            <div className={["font-medium text-[var(--color-gray-300)]", isCompact ? "text-xs" : "text-sm"].join(" ")}>{t(lang, "settingsShortcuts")}</div>
            <button
              disabled={busy}
              className={["rounded bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)]", isCompact ? "px-2.5 py-1 text-xs" : "px-3 py-2 text-sm"].join(" ")}
              onClick={() => setS({
                ...s,
                shortcuts: defaultShortcuts,
              })}
            >
              {t(lang, "resetDefault")}
            </button>
          </div>

          {(Object.entries({ ...defaultShortcuts, ...s.shortcuts }) as Array<[string, string]>).map(([key, val]) => (
            <div key={key} className={["flex items-center gap-3 border border-[var(--color-gray-800)] rounded-lg bg-[var(--color-gray-900)]", isCompact ? "px-3 py-2" : "px-4 py-3"].join(" ")}>
              <div className="flex-1 min-w-0">
                <div className={[isCompact ? "text-xs" : "text-sm", "text-[var(--color-gray-300)] truncate"].join(" ")}>{shortcutLabels[key] ?? key}</div>
                <div className="text-[10px] text-[var(--color-gray-600)]">{key}</div>
              </div>
              <input
                value={val}
                onChange={(e) => setS({ ...s, shortcuts: { ...s.shortcuts, [key]: e.currentTarget.value } })}
                className={[
                  "bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]",
                  isCompact ? "w-32 px-2 py-1 text-xs" : "w-40 px-3 py-2 text-sm"
                ].join(" ")}
              />
            </div>
          ))}
        </div>
      ) : null}

      {tab === "commandManager" ? (
        <div className={["flex flex-col", isCompact ? "gap-3" : "gap-4"].join(" ")}>
          {/* 子标签页：系统命令 / 自定义命令 / 历史记录 */}
          <div className={["flex gap-1 border-b border-[var(--color-gray-800)] -mt-1", isCompact ? "mb-2 px-1" : "mb-3 px-2"].join(" ")}>
            {[
              { id: "system" as const, label: t(lang, "systemCommands") },
              { id: "custom" as const, label: t(lang, "customCommands") },
              { id: "history" as const, label: t(lang, "commandHistory") },
            ].map((subTab) => (
              <button
                key={subTab.id}
                onClick={() => setCmdTab(subTab.id)}
                className={[
                  "font-medium border-b-2 transition-colors whitespace-nowrap -mb-px",
                  isCompact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                  cmdTab === subTab.id
                    ? "border-[var(--color-blue-500)] text-white"
                    : "border-transparent text-[var(--color-gray-500)] hover:text-[var(--color-gray-300)]",
                ].join(" ")}
              >
                {subTab.label}
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search className={["absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-gray-500)]", isCompact ? "size-3" : "size-4"].join(" ")} />
            <input
              value={cmdSearch}
              onChange={(e) => {
                setCmdSearch(e.currentTarget.value);
                if (cmdTab === "history") handleSearchHistory();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && cmdTab === "history") handleSearchHistory();
              }}
              placeholder={t(lang, "search")}
              className={[
                "w-full bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]",
                isCompact ? "pl-7 pr-2 py-1 text-xs" : "pl-8 pr-3 py-2 text-sm"
              ].join(" ")}
            />
          </div>

          {/* 系统命令 */}
          {cmdTab === "system" && (
            <div className={["flex flex-col", isCompact ? "gap-1.5" : "gap-2"].join(" ")}>
              <div className="flex justify-end">
                <button
                  onClick={handleResetSysCmds}
                  className={["rounded bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)]", isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"].join(" ")}
                >
                  {t(lang, "resetDefault")}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto border border-[var(--color-gray-800)] rounded-lg">
                {filteredSysCmds.map((cmd) => (
                  <div
                    key={cmd.id}
                    className={[
                      "flex items-center gap-2 px-3 py-2 border-b border-[var(--color-gray-800)] last:border-b-0",
                      disabledSys.has(cmd.id) ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={!disabledSys.has(cmd.id)}
                      onChange={() => handleToggleSysCmd(cmd.id)}
                      className="size-4 rounded accent-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className={["text-[var(--color-gray-200)] truncate", isCompact ? "text-xs" : "text-sm"].join(" ")}>{t(lang, cmd.displayNameKey)}</div>
                      <div className={["text-[var(--color-gray-500)] font-mono truncate", isCompact ? "text-[10px]" : "text-xs"].join(" ")}>{cmd.command}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 自定义命令 */}
          {cmdTab === "custom" && (
            <div className={["flex flex-col", isCompact ? "gap-2" : "gap-3"].join(" ")}>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleClearCustomCmds}
                  className={["rounded bg-[var(--color-gray-800)] text-red-300 hover:bg-[var(--color-gray-700)]", isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"].join(" ")}
                >
                  {t(lang, "clearAll")}
                </button>
                <button
                  onClick={handleAddCustomCmd}
                  className={["rounded bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]", isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"].join(" ")}
                >
                  {t(lang, "add")}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto border border-[var(--color-gray-800)] rounded-lg">
                {filteredCustomCmds.length === 0 ? (
                  <div className={["text-center text-[var(--color-gray-500)] py-4", isCompact ? "text-xs" : "text-sm"].join(" ")}>
                    {t(lang, "noCustomCommands")}
                  </div>
                ) : (
                  filteredCustomCmds.map((cmd) => (
                    <div key={cmd.id} className={["border-b border-[var(--color-gray-800)] last:border-b-0", isCompact ? "p-2" : "p-3"].join(" ")}>
                      <div className={["flex gap-2 items-center", isCompact ? "mb-1.5" : "mb-2"].join(" ")}>
                        <input
                          value={cmd.displayName || ""}
                          onChange={(e) => handleUpdateCustomCmd(cmd.id, cmd.command, e.currentTarget.value)}
                          placeholder={t(lang, "displayName")}
                          className={[
                            "flex-1 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]",
                            isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
                          ].join(" ")}
                        />
                        <button
                          onClick={() => handleDeleteCustomCmd(cmd.id)}
                          className={["rounded bg-[var(--color-gray-800)] text-red-300 hover:bg-[var(--color-gray-700)]", isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"].join(" ")}
                        >
                          {t(lang, "delete")}
                        </button>
                      </div>
                      <input
                        value={cmd.command}
                        onChange={(e) => handleUpdateCustomCmd(cmd.id, e.currentTarget.value, cmd.displayName)}
                        placeholder={t(lang, "commandContentPlaceholder")}
                        className={[
                          "w-full bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)] font-mono",
                          isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
                        ].join(" ")}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 历史记录 */}
          {cmdTab === "history" && (
            <div className={["flex flex-col", isCompact ? "gap-2" : "gap-3"].join(" ")}>
              <div className="flex justify-end">
                <button
                  onClick={handleClearHistory}
                  className={["rounded bg-[var(--color-gray-800)] text-red-300 hover:bg-[var(--color-gray-700)]", isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"].join(" ")}
                >
                  {t(lang, "clearAll")}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto border border-[var(--color-gray-800)] rounded-lg">
                {historyList.length === 0 ? (
                  <div className={["text-center text-[var(--color-gray-500)] py-4", isCompact ? "text-xs" : "text-sm"].join(" ")}>
                    {t(lang, "noHistory")}
                  </div>
                ) : (
                  historyList.map((cmd) => (
                    <div
                      key={cmd.id}
                      className={["border-b border-[var(--color-gray-800)] last:border-b-0 px-3 py-2 hover:bg-[var(--color-gray-800)]", isCompact ? "py-1.5" : ""].join(" ")}
                    >
                      <div className={["text-[var(--color-gray-200)] font-mono truncate", isCompact ? "text-xs" : "text-sm"].join(" ")}>{cmd.command}</div>
                      {cmd.lastUsedAt && (
                        <div className={["text-[var(--color-gray-500)]", isCompact ? "text-[10px]" : "text-xs"].join(" ")}>
                          {new Date(cmd.lastUsedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {tab === "importExport" ? (
        <div className={["flex flex-col", isCompact ? "gap-4" : "gap-6"].join(" ")}>
          <div className={["flex flex-col", isCompact ? "gap-2" : "gap-3"].join(" ")}>
            <div className={["font-medium text-[var(--color-gray-300)]", isCompact ? "text-xs" : "text-sm"].join(" ")}>{t(lang, "exportConfig")}</div>
            <button
              disabled={busy}
              className={["w-full text-left rounded-lg bg-[var(--color-gray-850)] border border-[var(--color-gray-800)] hover:bg-[var(--color-gray-800)] text-[var(--color-gray-200)]", isCompact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"].join(" ")}
              onClick={() => doExport(false)}
            >
              {t(lang, "exportNoSensitive")}
            </button>
            <button
              disabled={busy}
              className={["w-full text-left rounded-lg bg-[var(--color-gray-850)] border border-[var(--color-gray-800)] hover:bg-[var(--color-gray-800)] text-[var(--color-gray-200)]", isCompact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"].join(" ")}
              onClick={() => doExport(true)}
            >
              {t(lang, "exportWithSensitive")}
            </button>
          </div>

          <div className={["flex flex-col", isCompact ? "gap-2" : "gap-3"].join(" ")}>
            <div className={["font-medium text-[var(--color-gray-300)]", isCompact ? "text-xs" : "text-sm"].join(" ")}>{t(lang, "importConfig")}</div>
            <button
              disabled={busy}
              className={["w-full text-left rounded-lg bg-[var(--color-gray-850)] border border-[var(--color-gray-800)] hover:bg-[var(--color-gray-800)] text-[var(--color-gray-200)]", isCompact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"].join(" ")}
              onClick={() => doImport("merge")}
            >
              {t(lang, "importMerge")}
            </button>
            <button
              disabled={busy}
              className={["w-full text-left rounded-lg bg-[var(--color-gray-850)] border border-[var(--color-gray-800)] hover:bg-[var(--color-gray-800)] text-[var(--color-gray-200)]", isCompact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"].join(" ")}
              onClick={() => doImport("replace")}
            >
              {t(lang, "importReplace")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
