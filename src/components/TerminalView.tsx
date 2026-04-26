import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "xterm/css/xterm.css";
import type { PtyExitEvent, PtyOutputEvent, Settings, UUID } from "../types";
import { api } from "../api";
import { dbg, safeStr } from "../lib/debug";
import { useAppStore } from "../store/appStore";
import { tf } from "../lib/i18n";
import { addCommand } from "../lib/commandHistory";
import { getCompletions, applyCompletion } from "../lib/autoComplete";
import type { CompletionItem } from "../lib/autoComplete";
import { AutoCompletePopup } from "./AutoCompletePopup";

function normalizePosixPath(p: string) {
  const s = p.replace(/\\/g, "/");
  const isAbs = s.startsWith("/");
  const parts = s.split("/").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  const joined = out.join("/");
  return isAbs ? `/${joined}` : joined;
}

function parseCdTarget(line: string) {
  let s = line.trim();
  if (!s) return null;
  const idxDollar = s.lastIndexOf("$ ");
  const idxHash = s.lastIndexOf("# ");
  const cut = Math.max(idxDollar, idxHash);
  if (cut >= 0) {
    const candidate = s.slice(cut + 2).trim();
    if (candidate.startsWith("cd")) s = candidate;
  }
  if (s === "cd") return "~";
  if (!s.startsWith("cd")) return null;
  const rest = s.slice(2);
  if (rest.length > 0 && !/\s/.test(rest[0]!)) return null;
  let arg = rest.trim();
  if (!arg) return "~";
  const cut2 = arg.search(/(\s+&&\s+|\s+;\s+|&&|;)/);
  if (cut2 >= 0) arg = arg.slice(0, cut2).trim();
  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
    arg = arg.slice(1, -1);
  }
  return arg || null;
}

export function TerminalView(props: {
  ptyId: UUID | null;
  settings: Settings;
  onSize?: (cols: number, rows: number) => void;
  visible?: boolean;
  onTerminal?: (term: Terminal | null) => void;
  onSearchAddon?: (addon: SearchAddon | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const ptyIdRef = useRef<UUID | null>(props.ptyId);
  const onSizeRef = useRef<((cols: number, rows: number) => void) | undefined>(props.onSize);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const inputBufRef = useRef<string>("");
  const visibleRef = useRef<boolean>(props.visible ?? true);
  const [acVisible, setAcVisible] = useState(false);
  const [acItems, setAcItems] = useState<CompletionItem[]>([]);
  const [acSelectedIndex, setAcSelectedIndex] = useState(0);
  const acContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-complete: handle Tab key
  const handleAutoComplete = useCallback(() => {
    const term = termRef.current;
    if (!term) return;

    // Get current line content (approximation using buffer)
    const line = term.buffer.active.getLine(term.buffer.active.cursorY)?.translateToString(true).trimEnd() ?? "";
    const cursorX = term.buffer.active.cursorX;

    if (!line) {
      setAcVisible(false);
      return;
    }

    const prefix = line.slice(0, Math.min(cursorX, line.length));
    const candidates = getCompletions(prefix);

    if (candidates.length === 0) {
      setAcVisible(false);
      return;
    }

    // Single match - auto-insert
    if (candidates.length === 1) {
      const result = applyCompletion(line, cursorX, candidates[0]);
      // Write backspace to clear current input then type completion
      term.write("\x7b".repeat(cursorX)); // not reliable, just let shell handle Tab
      setAcVisible(false);
      return;
    }

    // Multiple matches - show popup
    setAcItems(candidates);
    setAcSelectedIndex(0);
    setAcVisible(true);
  }, []);

  const handleAcSelect = useCallback((item: CompletionItem) => {
    setAcVisible(false);
    // Let shell handle Tab natively for now; in production we'd inject text
  }, []);

  const handleAcClose = useCallback(() => {
    setAcVisible(false);
  }, []);

  const options = useMemo(
    () => ({
      fontFamily: props.settings.fontFamily,
      fontSize: props.settings.fontSize,
      lineHeight: props.settings.lineHeight,
      convertEol: true,
      cursorBlink: true,
    }),
    [props.settings.fontFamily, props.settings.fontSize, props.settings.lineHeight],
  );

  useEffect(() => {
    ptyIdRef.current = props.ptyId;
    dbg("debug", "ui.ptyId:update", { ptyId: props.ptyId });
  }, [props.ptyId]);

  useEffect(() => {
    onSizeRef.current = props.onSize;
  }, [props.onSize]);

  useEffect(() => {
    visibleRef.current = props.visible ?? true;
    props.onTerminal?.(visibleRef.current ? termRef.current : null);
    if (!visibleRef.current) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        if (!visibleRef.current) return;
        fit.fit();
        reportSize();
      } catch {
        undefined;
      }
    });
  }, [props.visible]);

  const reportSize = () => {
    const term = termRef.current;
    if (!term) return;
    const cols = term.cols;
    const rows = term.rows;
    if (cols <= 0 || rows <= 0) return;
    const prev = lastSizeRef.current;
    if (prev && prev.cols === cols && prev.rows === rows) return;
    lastSizeRef.current = { cols, rows };
    onSizeRef.current?.(cols, rows);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    dbg("info", "xterm:create", { ptyId: ptyIdRef.current, options });
    const term = new Terminal(options);
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(el);
    let raf: number | null = null;
    raf = requestAnimationFrame(() => {
      if (termRef.current !== term) return;
      if (!visibleRef.current) return;
      try {
        fit.fit();
        reportSize();
      } catch {
        undefined;
      }
    });

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;
    props.onTerminal?.(term);
    props.onSearchAddon?.(search);

    const d = term.onData((data) => {
      if (termRef.current !== term) return;
      const ptyId = ptyIdRef.current;
      if (!ptyId) return;
      dbg("debug", "ui->pty:data", { ptyId, len: data.length, preview: safeStr(data, 24) });
      const tab = useAppStore.getState().tabs.find((t) => t.ptyId === ptyId) ?? null;
      if (tab) {
        inputBufRef.current += data;
        const split = inputBufRef.current.split(/\r\n|\n|\r/);
        inputBufRef.current = split.pop() ?? "";
        for (const line of split) {
          // Record command to history
          if (line.trim()) {
            try { addCommand(String(ptyId), line.trim()); } catch {}
          }

          const target = parseCdTarget(line);
          if (!target) continue;
          const curr = tab.sshCwdHint ?? "";
          let next: string | null = null;
          if (target.startsWith("/")) {
            next = normalizePosixPath(target);
          } else if (target === "..") {
            if (curr.startsWith("/")) next = normalizePosixPath(`${curr}/..`);
          } else if (target.startsWith("./")) {
            if (curr.startsWith("/")) next = normalizePosixPath(`${curr}/${target}`);
          } else if (target.startsWith("../")) {
            if (curr.startsWith("/")) next = normalizePosixPath(`${curr}/${target}`);
          } else if (target === "-" || target.startsWith("~")) {
            next = null;
          } else {
            if (curr.startsWith("/")) next = normalizePosixPath(`${curr}/${target}`);
          }
          if (next && next.startsWith("/")) {
            useAppStore.setState({
              tabs: useAppStore.getState().tabs.map((t) => (t.id === tab.id ? { ...t, sshCwdHint: next } : t)),
            });
          }
        }
      }
      api.ptySend(ptyId, data).catch(() => undefined);
    });

    const ro = new ResizeObserver(() => {
      try {
        if (termRef.current !== term) return;
        if (!visibleRef.current) return;
        fit.fit();
        reportSize();
      } catch {
        undefined;
      }
    });
    ro.observe(el);

    return () => {
      dbg("info", "xterm:dispose", { ptyId: ptyIdRef.current });
      ro.disconnect();
      d.dispose();
      if (raf !== null) cancelAnimationFrame(raf);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      props.onTerminal?.(null);
      props.onSearchAddon?.(null);
    };
  }, [options]);

  useEffect(() => {
    let unlistenOut: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    listen<PtyOutputEvent>("zssh://pty-output", (e) => {
      if (e.payload.ptyId !== ptyIdRef.current) return;
      dbg("debug", "pty->ui:output", { ptyId: e.payload.ptyId, len: e.payload.data.length, preview: safeStr(e.payload.data, 60) });
      const s = e.payload.data;
      const markerHit = s.includes("__ZSSH_CWD__") || s.includes("printf '%s\\n' \"__ZSSH_CWD__") || s.includes("printf '%s\n' \"__ZSSH_CWD__");
      if (!markerHit) {
        termRef.current?.write(s);
        return;
      }
      const kept = s
        .replace("\r\n", "\n")
        .split("\n")
        .filter((l) => !l.includes("__ZSSH_CWD__") && !l.includes("printf '%s\\n' \"__ZSSH_CWD__") && !l.includes("printf '%s\n' \"__ZSSH_CWD__"))
        .join("\n");
      if (kept) termRef.current?.write(kept);
    })
      .then((fn) => {
        unlistenOut = fn;
      })
      .catch(() => undefined);

    listen<PtyExitEvent>("zssh://pty-exit", (e) => {
      if (e.payload.ptyId !== ptyIdRef.current) return;
      dbg("info", "pty->ui:exit", { ptyId: e.payload.ptyId, exitCode: e.payload.exitCode ?? null });
      const term = termRef.current;
      if (!term) return;
      term.writeln("");
      term.writeln(tf(props.settings.language, "terminalProcessExited", { code: e.payload.exitCode ?? "?" }));
    })
      .then((fn) => {
        unlistenExit = fn;
      })
      .catch(() => undefined);

    return () => {
      unlistenOut?.();
      unlistenExit?.();
    };
  }, []);

  return (
    <div ref={acContainerRef} className="relative w-full h-full bg-[var(--color-gray-950)]">
      <div ref={containerRef} className="w-full h-full bg-[var(--color-gray-950)]"
        onKeyDown={(e) => {
          if (e.key === "Tab" && acVisible) {
            e.preventDefault();
            handleAcSelect(acItems[acSelectedIndex]);
            return;
          }
          if (e.key === "Tab") {
            // Let shell's native tab completion work
            return;
          }
        }}
      />
      <AutoCompletePopup
        items={acItems}
        selectedIndex={acSelectedIndex}
        visible={acVisible}
        onSelect={handleAcSelect}
        onHighlight={(i) => setAcSelectedIndex(i)}
        onClose={handleAcClose}
        lang={props.settings.language}
      />
    </div>
  );
}
