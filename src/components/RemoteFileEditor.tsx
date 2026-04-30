import { useState, useEffect, useCallback } from "react";
import type { UUID } from "../types";
import { api } from "../api";
import { t, tf } from "../lib/i18n";
import {
  X,
  Save,
  Loader2,
  AlertTriangle,
  FileText,
  Copy,
  CheckCircle,
} from "lucide-react";

interface RemoteFileEditorProps {
  open: boolean;
  ptyId: UUID | null;
  remotePath: string;
  fileName: string;
  onClose: () => void;
  lang?: string;
}

export function RemoteFileEditor({
  open,
  ptyId,
  remotePath,
  fileName,
  onClose,
  lang,
}: RemoteFileEditorProps) {
  const lang_ = lang ?? "zh-CN";
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modified, setModified] = useState(false);
  const [lineNumbers] = useState(true);

  // Load file content when dialog opens
  useEffect(() => {
    if (!open || !ptyId) return;

    async function loadContent() {
      setLoading(true);
      setError(null);
      setSaved(false);
      setModified(false);
      try {
        // Download to a temp location - read as text
        // For SFTP-based editing, we use cat command to read content
        // This is a workaround since sftp get downloads binary
        await api.ptySend(ptyId!, `cat "${remotePath}"\n`);
        // The content will come back through pty-output event
        // For simplicity, show a message about loading from terminal
        setContent(`// ${t(lang_, "remoteEditLoadingHint")}\n// ${tf(lang_, "remoteEditPath", { path: remotePath })}\n`);
        setOriginalContent(content);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }

    loadContent();
  }, [open, ptyId, remotePath]);

  const handleSave = useCallback(async () => {
    if (!ptyId) return;
    setSaving(true);
    setError(null);
    try {
      // Use a heredoc to write content back to the remote file
      await api.ptySend(ptyId, `cat > '${remotePath}' << 'ZSSHEOF'\n${content}\nZSSHEOF\n`);
      setOriginalContent(content);
      setModified(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [ptyId, remotePath, content]);

  const handleContentChange = (value: string) => {
    setContent(value);
    setModified(value !== originalContent);
    setSaved(false);
  };

  if (!open) return null;

  const lines = content.split("\n");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onContextMenu={(e) => e.preventDefault()}>
      <div className="w-[85vw] max-w-[900px] h-[80vh] flex flex-col rounded-lg bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-gray-800)] bg-[var(--color-gray-950)] rounded-t-lg">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 text-blue-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white truncate">{fileName}</span>
            <span className="text-xs text-[var(--color-gray-500)] truncate ml-1">{remotePath}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {modified ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300">
                *
              </span>
            ) : null}
            {saved ? (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-900/50 text-green-300">
                <CheckCircle className="size-3" />
                {t(lang_, "remoteEditSaved")}
              </span>
            ) : null}
            <button
              onClick={handleSave}
              disabled={saving || !modified}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Ctrl+S
            </button>
            <button
              onClick={() => {
                if (modified && !window.confirm(t(lang_, "remoteEditCloseConfirm"))) return;
                onClose();
              }}
              className="text-[var(--color-gray-400)] hover:text-white p-1"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-900/30 border-b border-red-800/30">
            <AlertTriangle className="size-4 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-300 flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
              <X className="size-3" />
            </button>
          </div>
        ) : null}

        {/* Editor area */}
        <div className="flex-1 overflow-hidden flex">
          {/* Line numbers */}
          {lineNumbers ? (
            <div className="flex-shrink-0 w-12 bg-[var(--color-gray-950)] border-r border-[var(--color-gray-800)] overflow-auto select-none py-3">
              {lines.map((_, i) => (
                <div key={i} className="text-right pr-2 pl-2 text-[11px] leading-6 text-[var(--color-gray-600)] tabular-nums font-mono">
                  {i + 1}
                </div>
              ))}
            </div>
          ) : null}

          {/* Textarea editor */}
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                handleSave();
              }
            }}
            disabled={loading || saving}
            placeholder={
              loading
                ? t(lang_, "remoteEditLoading")
                : t(lang_, "remoteEditPlaceholder")
            }
            spellCheck={false}
            className="flex-1 resize-none bg-[var(--color-gray-950)] text-white text-sm font-mono leading-6 p-3 outline-none disabled:opacity-70"
            style={{ tabSize: 2 }}
          />
        </div>

        {/* Footer status bar */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-[var(--color-gray-800)] bg-[var(--color-gray-950)] text-[10px] text-[var(--color-gray-500)] rounded-b-lg">
          <span>{lines.length} lines</span>
          <span className="flex items-center gap-3">
            <span>{content.length} chars</span>
            <button
              onClick={() => navigator.clipboard.writeText(content).catch(() => undefined)}
              className="hover:text-white"
              title={t(lang_, "copy")}
            >
              <Copy className="size-3" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
