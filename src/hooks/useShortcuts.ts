import { useEffect, useRef } from "react";

function normalizeKey(k: string) {
  return k.trim().toLowerCase();
}

function normalizeShortcutKeyToken(k: string) {
  const n = normalizeKey(k);
  if (n === "," || n === "comma") return "comma";
  if (n === "." || n === "period" || n === "dot") return "period";
  if (n === "esc") return "escape";
  if (n === "del") return "delete";
  return n;
}

function parseShortcut(s: string) {
  const parts = s.split("+").map((p) => normalizeKey(p));
  const keyRaw = parts.find((p) => !["ctrl", "control", "shift", "alt", "meta", "cmd", "command"].includes(p)) ?? "";
  const key = normalizeShortcutKeyToken(keyRaw);
  return {
    ctrl: parts.includes("ctrl") || parts.includes("control"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("command"),
    key,
  };
}

function eventKey(e: KeyboardEvent) {
  const code = normalizeKey(e.code);
  if (code === "comma") return "comma";
  if (code === "period") return "period";
  if (code.startsWith("key") && code.length === 4) return code[3]!;
  if (code.startsWith("digit") && code.length === 6) return code[5]!;

  const k = normalizeShortcutKeyToken(e.key);
  if (k === " ") return "space";
  return k;
}

export function useShortcuts(shortcuts: Record<string, string> | undefined, handlers: Record<string, () => void>) {
  // 使用 ref 存储最新的 handlers，确保 onKeyDown 始终能访问最新的函数
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!shortcuts) return;

    const entries = Object.entries(shortcuts)
      .map(([action, sc]) => [action, parseShortcut(sc)] as const)
      .filter(([action, parsed]) => !!action && !!parsed.key);

    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const inXterm = !!el?.closest?.(".xterm");
      const tag = el?.tagName?.toLowerCase?.() ?? "";
      const inEditable = !inXterm && (tag === "input" || tag === "textarea" || tag === "select" || !!(el as any)?.isContentEditable);

      const allowInXterm = inXterm ? new Set(["commandPalette", "nextTab", "prevTab", "copy", "terminalSearch", "commandHistory"]) : null;
      const allowInEditable = inEditable ? new Set(["commandPalette", "nextTab", "prevTab", "closeTab", "copy"]) : null;
      const currentHandlers = handlersRef.current;
      for (const [action, s] of entries) {
        if (allowInXterm && !allowInXterm.has(action)) continue;
        if (allowInEditable && !allowInEditable.has(action)) continue;
        if (e.ctrlKey !== s.ctrl) continue;
        if (e.shiftKey !== s.shift) continue;
        if (e.altKey !== s.alt) continue;
        if (e.metaKey !== s.meta) continue;
        if (eventKey(e) !== s.key) continue;
        const fn = currentHandlers[action];
        if (!fn) continue;
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        fn();
        break;
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [shortcuts]);
}
