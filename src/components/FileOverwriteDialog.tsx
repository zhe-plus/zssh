import { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { FileWarning } from "lucide-react";

export type FileOverwriteAction = "overwrite" | "rename" | "cancel" | null;

interface FileOverwriteDialogProps {
  open: boolean;
  fileName: string;
  renameName?: string;
  onClose: () => void;
  onAction: (action: FileOverwriteAction, renameName?: string) => void;
  lang?: string;
}

export function FileOverwriteDialog(props: FileOverwriteDialogProps) {
  const { open, fileName, renameName: initialRenameName, onClose, onAction, lang = "zh-CN" } = props;

  const defaultName = fileName.includes(".")
    ? fileName.slice(0, fileName.lastIndexOf(".")) + "_copy" + fileName.slice(fileName.lastIndexOf("."))
    : fileName + "_copy";

  const [newName, setNewName] = useState<string>(initialRenameName ?? defaultName);

  // 当对话框打开或初始值变化时，重置输入框
  useEffect(() => {
    if (open) {
      setNewName(initialRenameName ?? defaultName);
    }
  }, [open, initialRenameName, defaultName]);

  const handleRename = () => {
    const nameToUse = newName.trim() || defaultName;
    onAction("rename", nameToUse);
  };

  const handleClose = () => {
    onClose();
  };

  const handleCancel = () => {
    onAction("cancel");
  };

  return (
    <Modal
      open={open}
      title={lang === "zh-CN" ? "文件已存在" : lang === "zh-TW" ? "檔案已存在" : "File Exists"}
      onClose={handleClose}
      footer={
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-1.5 bg-[var(--color-gray-700)] text-white rounded hover:bg-[var(--color-gray-600)] text-sm"
            onClick={handleCancel}
          >
            {lang === "zh-CN" ? "取消上传" : lang === "zh-TW" ? "取消上傳" : "Cancel Upload"}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={defaultName}
              className="w-48 px-2 py-1 text-sm bg-[var(--color-gray-950)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-[var(--color-blue-500)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRename();
                }
              }}
            />
            <button
              className="px-4 py-1.5 bg-[var(--color-yellow-600)] text-white rounded hover:bg-[var(--color-yellow-500)] text-sm"
              onClick={handleRename}
            >
              {lang === "zh-CN" ? "重命名上传" : lang === "zh-TW" ? "重新命名上傳" : "Rename & Upload"}
            </button>
          </div>
          <button
            className="px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-500 text-sm"
            onClick={() => onAction("overwrite")}
          >
            {lang === "zh-CN" ? "覆盖" : lang === "zh-TW" ? "覆蓋" : "Overwrite"}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-4">
        <FileWarning className="size-10 text-yellow-500 flex-shrink-0 mt-1" />
        <div>
          <p className="text-sm text-[var(--color-gray-300)] mb-2">
            {lang === "zh-CN"
              ? `远程目录已存在同名文件：`
              : lang === "zh-TW"
              ? `遠端目錄已存在同名檔案：`
              : `Remote directory already has a file named:`}
          </p>
          <p className="text-base font-medium text-white font-mono bg-[var(--color-gray-800)] px-3 py-2 rounded">
            {fileName}
          </p>
        </div>
      </div>
    </Modal>
  );
}
