import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  X,
  Plus,
  Trash2,
  Save,
  ClipboardPaste,
  Clock,
  FileText,
  Eye,
  Edit3,
  Download,
  Send,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { t } from "../lib/i18n";
import { useNotepadStore } from "../store/notepadStore";

export interface NotepadPanelProps {
  open: boolean;
  onClose: () => void;
  lang?: string;
  clipboardText?: string;
  onSendToTerminal?: (text: string) => void;
}

// Simple Markdown → HTML renderer (no dependency required)
function renderMarkdown(src: string): string {
  let html = src;

  // Escape HTML entities
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="notepad-code-block"><code class="lang-${lang || "text"}">${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="notepad-inline-code">$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="notepad-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="notepad-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="notepad-h1">$1</h1>');

  // Bold / Italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Unordered list items
  html = html.replace(/^[-*] (.+)$/gm, '<li class="notepad-li">$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li class="notepad-li">.*<\/li>\n?)+)/g, '<ul class="notepad-ul">$1</ul>');

  // Ordered list items
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="notepad-oli">$1</li>');
  html = html.replace(/((?:<li class="notepad-oli">.*<\/li>\n?)+)/g, '<ol class="notepad-ol">$1</ol>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="notepad-hr" />');

  // Paragraphs: double newline → paragraph break
  html = html.replace(/\n{2,}/g, '</p><p class="notepad-p">');

  // Single newline → <br>
  html = html.replace(/\n/g, "<br />");

  // Wrap in paragraph
  html = `<p class="notepad-p">${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p class="notepad-p"><\/p>/g, "");
  html = html.replace(/<p class="notepad-p"><br \/><\/p>/g, "");

  return html;
}

export function NotepadPanel({ open, onClose, lang, clipboardText, onSendToTerminal }: NotepadPanelProps) {
  const lang_ = lang ?? "zh-CN";
  const store = useNotepadStore();
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview">("split");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string; source: "editor" | "preview" } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 100, y: 50 });
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const activeNote = useMemo(
    () => store.notes.find((n) => n.id === store.activeNoteId) ?? null,
    [store.notes, store.activeNoteId],
  );

  const activeContent = useMemo(
    () => (activeNote ? store.contents[activeNote.id] ?? "" : ""),
    [activeNote, store.contents],
  );

  // Handle clipboard text injection
  useEffect(() => {
    if (clipboardText && open && activeNote) {
      store.updateContent(activeNote.id, activeContent + (activeContent ? "\n" : "") + clipboardText);
    }
  }, [clipboardText]);

  // ESC key to close
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Ctrl+S to save
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        store.saveToStorage();
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 1500);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, store]);

  const handleContentChange = useCallback(
    (value: string) => {
      if (!activeNote) return;
      store.updateContent(activeNote.id, value);
    },
    [activeNote, store],
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      if (!activeNote) return;
      store.updateTitle(activeNote.id, value);
    },
    [activeNote, store],
  );

  const handleNewNote = useCallback(() => {
    const id = store.createNote();
    store.setActiveNote(id);
  }, [store]);

  const handleDeleteNote = useCallback(
    (id: string) => {
      if (!window.confirm(t(lang_, "notepadConfirmDelete"))) return;
      store.deleteNote(id);
    },
    [store, lang_],
  );

  const handlePasteClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && activeNote) {
        store.updateContent(activeNote.id, activeContent + (activeContent ? "\n" : "") + text);
      }
    } catch {
      // Clipboard API might not be available
    }
  }, [activeNote, activeContent, store]);

  const handleInsertTimestamp = useCallback(() => {
    if (!activeNote) return;
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    store.updateContent(activeNote.id, activeContent + (activeContent ? "\n" : "") + ts);
  }, [activeNote, activeContent, store]);

  const handleSave = useCallback(() => {
    store.saveToStorage();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1500);
  }, [store]);

  const handleExport = useCallback(() => {
    if (!activeNote) return;
    const content = store.contents[activeNote.id] ?? "";
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeNote.title || "note"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeNote, store]);

  const handleSendToTerminal = useCallback((text: string) => {
    if (onSendToTerminal) {
      onSendToTerminal(text);
      setContextMenu(null);
    }
  }, [onSendToTerminal]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      setContextMenu({ x: e.clientX, y: e.clientY, text: selection, source: "editor" });
    }
  }, []);

  const handlePreviewContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      setContextMenu({ x: e.clientX, y: e.clientY, text: selection, source: "preview" });
    }
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu]);

  // Drag handlers for floating window
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    setDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, dragOffset]);

  // Split divider drag handler
  const handleSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  }, []);

  useEffect(() => {
    if (!isDraggingSplit) return;
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("notepad-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newRatio = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.min(Math.max(newRatio, 20), 80));
    };
    const handleMouseUp = () => setIsDraggingSplit(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSplit]);

  // Window resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, w: size.width, h: size.height });
  }, [size]);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;
      setSize({
        width: Math.max(400, resizeStart.w + dx),
        height: Math.max(300, resizeStart.h + dy),
      });
    };
    const handleMouseUp = () => setResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, resizeStart]);

  const previewHtml = useMemo(() => renderMarkdown(activeContent), [activeContent]);

  if (!open) return null;

  return (
    <>
      <div
        className={`fixed z-[55] flex flex-col rounded-lg bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] shadow-2xl ${dragging || resizing ? "select-none" : ""}`}
        style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
      >
      {/* Header - Drag Handle */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-gray-800)] rounded-t-lg shrink-0 cursor-move bg-[var(--color-gray-850)]"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-blue-400" />
          <h3 className="text-sm font-medium text-white">{t(lang_, "notepadTitle")}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 rounded text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)]"
            title={t(lang_, "notepadToggleSidebar")}
          >
            {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          {savedNotice && (
            <span className="text-xs text-emerald-400 mr-2">{t(lang_, "notepadSaved")}</span>
          )}
          <button
            onClick={() => setViewMode("edit")}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${viewMode === "edit" ? "bg-[var(--color-blue-600)] text-white" : "text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)]"}`}
            title={t(lang_, "notepadEditOnly")}
          >
            <Edit3 className="size-3.5" />
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${viewMode === "split" ? "bg-[var(--color-blue-600)] text-white" : "text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)]"}`}
            title={t(lang_, "notepadSplitView")}
          >
            <Edit3 className="size-3.5" />
            <Eye className="size-3.5" />
          </button>
          <button
            onClick={() => setViewMode("preview")}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${viewMode === "preview" ? "bg-[var(--color-blue-600)] text-white" : "text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)]"}`}
            title={t(lang_, "notepadPreviewOnly")}
          >
            <Eye className="size-3.5" />
          </button>
          <button onClick={onClose} className="p-1 rounded text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)]">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - File List */}
          {!sidebarCollapsed && (
            <div className="w-48 shrink-0 border-r border-[var(--color-gray-800)] flex flex-col bg-[var(--color-gray-950)] overflow-hidden">
              <div className="px-2 py-1.5 border-b border-[var(--color-gray-800)]">
                <button
                  onClick={handleNewNote}
                  className="w-full px-2 py-1 rounded text-xs text-[var(--color-gray-300)] hover:bg-[var(--color-gray-800)] flex items-center gap-1.5"
                >
                  <Plus className="size-3.5" />
                  {t(lang_, "notepadNewNote")}
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                {store.notes.map((note) => (
                  <div
                    key={note.id}
                    className={[
                      "group flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs",
                      note.id === store.activeNoteId
                        ? "bg-[var(--color-blue-600)]/20 text-white"
                        : "text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-[var(--color-gray-200)]",
                    ].join(" ")}
                    onClick={() => store.setActiveNote(note.id)}
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="truncate flex-1">{note.title}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-500)] hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      title={t(lang_, "delete")}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
                {store.notes.length === 0 && (
                  <div className="px-3 py-4 text-[10px] text-[var(--color-gray-600)] text-center">
                    {t(lang_, "notepadEmptyHint")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Title + toolbar */}
            <div className="flex justify-between items-center gap-2 px-3 py-1.5 border-b border-[var(--color-gray-800)] shrink-0">
              <div className="flex-1 min-w-0 flex items-center">
                <input
                  type="text"
                  value={activeNote?.title ?? ""}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={t(lang_, "notepadTitlePlaceholder")}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[var(--color-gray-600)]"
                  disabled={!activeNote}
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handlePasteClipboard}
                  disabled={!activeNote}
                  className="px-2 py-1 rounded text-[10px] text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)] disabled:opacity-40 flex items-center gap-1"
                  title={t(lang_, "notepadPasteClipboard")}
                >
                  <ClipboardPaste className="size-3" />
                  {t(lang_, "notepadPaste")}
                </button>
                <button
                  onClick={handleInsertTimestamp}
                  disabled={!activeNote}
                  className="px-2 py-1 rounded text-[10px] text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)] disabled:opacity-40 flex items-center gap-1"
                  title={t(lang_, "notepadInsertTimestamp")}
                >
                  <Clock className="size-3" />
                  {t(lang_, "notepadTimestamp")}
                </button>
                <button
                  onClick={handleSave}
                  className="px-2 py-1 rounded text-[10px] text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)] flex items-center gap-1"
                  title={t(lang_, "save")}
                >
                  <Save className="size-3" />
                  {t(lang_, "save")}
                </button>
                <button
                  onClick={handleExport}
                  disabled={!activeNote}
                  className="px-2 py-1 rounded text-[10px] text-[var(--color-gray-400)] hover:text-white hover:bg-[var(--color-gray-800)] disabled:opacity-40 flex items-center gap-1"
                  title={t(lang_, "notepadExport")}
                >
                  <Download className="size-3" />
                  {t(lang_, "notepadExport")}
                </button>
              </div>
            </div>

            {/* Editor + Preview */}
            <div id="notepad-split-container" className="flex-1 flex min-h-0">
              {activeNote ? (
                <>
                  {/* Editor */}
                  {viewMode !== "preview" && (
                    <div
                      className="flex flex-col overflow-hidden shrink-0"
                      style={{ width: `${splitRatio}%` }}
                    >
                      <textarea
                        ref={editorRef}
                        value={activeContent}
                        onChange={(e) => handleContentChange(e.target.value)}
                        onContextMenu={handleContextMenu}
                        className="flex-1 bg-transparent text-sm text-[var(--color-gray-200)] font-mono p-3 outline-none resize-none placeholder:text-[var(--color-gray-700)] leading-relaxed"
                        placeholder={t(lang_, "notepadEditorPlaceholder")}
                        spellCheck={false}
                      />
                    </div>
                  )}

                  {/* Split Divider */}
                  {viewMode === "split" && (
                    <div
                      className="w-1 bg-[var(--color-gray-800)] hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors"
                      onMouseDown={handleSplitDragStart}
                    />
                  )}

                  {/* Preview */}
                  {(viewMode === "split" || viewMode === "preview") && (
                    <div
                      className="overflow-auto p-3 shrink-0"
                      ref={previewRef}
                      onContextMenu={handlePreviewContextMenu}
                      style={{ width: `${100 - splitRatio}%` }}
                    >
                      <div
                        className="notepad-preview text-sm text-[var(--color-gray-300)] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[var(--color-gray-600)] text-sm">
                  <div className="text-center">
                    <FileText className="size-8 mx-auto mb-2 opacity-50" />
                    <div>{t(lang_, "notepadNoNoteSelected")}</div>
                    <button
                      onClick={handleNewNote}
                      className="mt-2 px-3 py-1 rounded text-xs bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]"
                    >
                      {t(lang_, "notepadNewNote")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-1.5 border-t border-[var(--color-gray-800)] flex items-center justify-between text-[10px] text-[var(--color-gray-600)] rounded-b-lg shrink-0">
          <span>
            {activeNote
              ? `${activeContent.length} ${t(lang_, "notepadChars")} | ${activeContent.split("\n").length} ${t(lang_, "notepadLines")}`
              : ""}
          </span>
          <span>{t(lang_, "notepadStorageHint")}</span>
        </div>

        {/* Resize Handle */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group"
          onMouseDown={handleResizeStart}
        >
          <svg
            className="absolute bottom-1 right-1 text-[var(--color-gray-600)] group-hover:text-[var(--color-gray-400)]"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      {/* Context Menu - Send to Terminal */}
      {contextMenu && (
        <div
          className="fixed z-[60] bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleSendToTerminal(contextMenu.text)}
            className="w-full px-3 py-1.5 text-sm text-left text-[var(--color-gray-200)] hover:bg-[var(--color-gray-700)] flex items-center gap-2"
          >
            <Send className="size-4 text-blue-400" />
            <span>发送到 SSH 并执行</span>
          </button>
        </div>
      )}

      {/* Preview styles */}
      <style>{`
        .notepad-preview .notepad-h1 {
          font-size: 1.5em;
          font-weight: 700;
          margin: 0.6em 0 0.3em;
          color: var(--color-gray-100);
          border-bottom: 1px solid var(--color-gray-800);
          padding-bottom: 0.3em;
        }
        .notepad-preview .notepad-h2 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0.5em 0 0.25em;
          color: var(--color-gray-100);
        }
        .notepad-preview .notepad-h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 0.4em 0 0.2em;
          color: var(--color-gray-200);
        }
        .notepad-preview .notepad-code-block {
          background: var(--color-gray-950);
          border: 1px solid var(--color-gray-800);
          border-radius: 6px;
          padding: 0.75em 1em;
          margin: 0.5em 0;
          overflow-x: auto;
          font-size: 0.85em;
          line-height: 1.5;
        }
        .notepad-preview .notepad-inline-code {
          background: var(--color-gray-800);
          border-radius: 3px;
          padding: 0.1em 0.35em;
          font-size: 0.9em;
          font-family: ui-monospace, monospace;
        }
        .notepad-preview .notepad-ul {
          list-style: disc;
          margin: 0.3em 0;
          padding-left: 1.5em;
        }
        .notepad-preview .notepad-ol {
          list-style: decimal;
          margin: 0.3em 0;
          padding-left: 1.5em;
        }
        .notepad-preview .notepad-li,
        .notepad-preview .notepad-oli {
          margin: 0.15em 0;
        }
        .notepad-preview .notepad-hr {
          border: none;
          border-top: 1px solid var(--color-gray-800);
          margin: 1em 0;
        }
        .notepad-preview .notepad-p {
          margin: 0.3em 0;
        }
        .notepad-preview a {
          color: var(--color-blue-400);
          text-decoration: underline;
        }
        .notepad-preview a:hover {
          color: var(--color-blue-300);
        }
        .notepad-preview strong {
          color: var(--color-gray-100);
          font-weight: 600;
        }
        .notepad-preview em {
          font-style: italic;
        }
      `}</style>
    </>
  );
}
