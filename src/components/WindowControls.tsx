import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, AppWindow } from "lucide-react";
import { useState, useEffect } from "react";

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        setIsMaximized(maximized);
      } catch {
        // ignore
      }
    };
    checkMaximized();

    const unlisten = getCurrentWindow().onResized(async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        setIsMaximized(maximized);
      } catch {
        // ignore
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    getCurrentWindow().minimize();
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const win = getCurrentWindow();
    if (isMaximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    getCurrentWindow().close();
  };

  return (
    <div className="flex items-center h-full px-1">
      <button
        onClick={handleMinimize}
        className="w-10 h-10 flex items-center justify-center text-[var(--color-gray-400)] hover:bg-[var(--color-gray-700)] hover:text-white transition-all rounded"
        title="最小化"
      >
        <Minus className="size-4" />
      </button>
      <button
        onClick={handleMaximize}
        className="w-10 h-10 flex items-center justify-center text-[var(--color-gray-400)] hover:bg-[var(--color-gray-700)] hover:text-white transition-all rounded"
        title={isMaximized ? "还原" : "最大化"}
      >
        {isMaximized ? (
          <AppWindow className="size-3.5" />
        ) : (
          <Square className="size-3.5" />
        )}
      </button>
      <button
        onClick={handleClose}
        className="w-10 h-10 flex items-center justify-center text-[var(--color-gray-400)] hover:bg-red-600 hover:text-white transition-all rounded"
        title="关闭"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
