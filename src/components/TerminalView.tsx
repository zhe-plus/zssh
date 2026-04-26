import { useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import type { PtyExitEvent, PtyOutputEvent, Settings, UUID } from "../types";
import { api } from "../api";
import { dbg, safeStr } from "../lib/debug";
import { useAppStore } from "../store/appStore";
import { tf } from "../lib/i18n";

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
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<UUID | null>(props.ptyId);
  const onSizeRef = useRef<((cols: number, rows: number) => void) | undefined>(props.onSize);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const inputBufRef = useRef<string>("");
  const visibleRef = useRef<boolean>(props.visible ?? true);

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
    term.loadAddon(fit);
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
    props.onTerminal?.(term);

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
      props.onTerminal?.(null);
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

  return <div ref={containerRef} className="w-full h-full bg-[var(--color-gray-950)]" />;
}
