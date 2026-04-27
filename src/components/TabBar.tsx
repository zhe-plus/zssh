import { CSS } from "@dnd-kit/utilities";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import type { Tab } from "../store/appStore";
import { useEffect, useState, type CSSProperties } from "react";
import type { UUID } from "../types";
import { Plus, X, Copy, PlugZap } from "lucide-react";
import { isCompactLayout } from "../lib/layout";
import { WindowControls } from "./WindowControls";

function TabItem(props: {
  tab: Tab;
  active: boolean;
  isCompact: boolean;
  onClick: () => void;
  onClose: () => void;
  onDuplicate: () => void;
  onContextMenu: (ev: React.MouseEvent, tabId: UUID) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.tab.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    cursor: "default",
    display: "flex",
    alignItems: "center",
    gap: 8,
    userSelect: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={props.onClick}
      onContextMenu={(ev) => {
        ev.preventDefault();
        props.onContextMenu(ev, props.tab.id);
      }}
      onMouseDown={(e) => {
        if (e.button === 2) {
          e.stopPropagation();
        }
      }}
      className={[
        "flex items-center gap-2 rounded cursor-pointer group relative flex-shrink-0 border",
        props.isCompact ? "h-7 px-2.5" : "h-9 px-3.5",
        props.active
          ? "bg-[var(--color-gray-950)] text-white border-[var(--color-gray-800)]"
          : "bg-transparent text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] border-transparent",
      ].join(" ")}
    >
      <div className={["size-1.5 rounded-full", props.tab.ptyId ? "bg-emerald-500" : "bg-[var(--color-gray-600)]"].join(" ")} />
      <div className={["max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap", props.isCompact ? "text-xs" : "text-sm"].join(" ")}>
        {props.tab.title}
      </div>

      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onClose();
          }}
          className="hover:bg-[var(--color-gray-700)] rounded p-0.5"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function TabBar(props: {
  tabs: Tab[];
  activeTabId: UUID | null;
  onReorder: (ids: UUID[]) => void;
  onSelect: (id: UUID) => void;
  onClose: (id: UUID) => void;
  onNewSession: () => void;
  onDuplicateTab?: (tabId: UUID) => void;
  layoutMode?: string;
  newSessionTitle?: string;
  duplicateLabel?: string;
  closeLabel?: string;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; tabId: UUID | null }>({ open: false, x: 0, y: 0, tabId: null });
  const isCompact = isCompactLayout(props.layoutMode);

  useEffect(() => {
    if (!menu.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu({ open: false, x: 0, y: 0, tabId: null });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menu.open]);

  function openMenu(ev: React.MouseEvent, tabId: UUID) {
    ev.preventDefault();
    ev.stopPropagation();
    props.onSelect(tabId);
    const menuW = 170;
    const menuH = 96;
    const x = Math.max(8, Math.min(ev.clientX, window.innerWidth - menuW - 8));
    const y = Math.max(8, Math.min(ev.clientY, window.innerHeight - menuH - 8));
    setMenu({ open: true, x, y, tabId });
  }

  return (
    <div
      className={[
        "bg-[var(--color-gray-900)] border-b border-[var(--color-gray-800)] flex items-center overflow-hidden",
        isCompact ? "h-10" : "h-12",
      ].join(" ")}
      onScroll={() => (menu.open ? setMenu({ open: false, x: 0, y: 0, tabId: null }) : undefined)}
      onWheel={() => (menu.open ? setMenu({ open: false, x: 0, y: 0, tabId: null }) : undefined)}
    >
      <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0" data-tauri-drag-region>
        <DndContext
        sensors={sensors}
        onDragEnd={(evt) => {
          const { active, over } = evt;
          if (!over) return;
          if (active.id === over.id) return;
          const ids = props.tabs.map((t) => t.id);
          const oldIndex = ids.indexOf(String(active.id));
          const newIndex = ids.indexOf(String(over.id));
          props.onReorder(arrayMove(ids, oldIndex, newIndex) as UUID[]);
        }}
      >
        <SortableContext items={props.tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          {props.tabs.map((t) => (
            <TabItem
              key={t.id}
              tab={t}
              active={t.id === props.activeTabId}
              isCompact={isCompact}
              onClick={() => props.onSelect(t.id)}
              onClose={() => props.onClose(t.id)}
              onDuplicate={() => props.onDuplicateTab?.(t.id)}
              onContextMenu={openMenu}
            />
          ))}
        </SortableContext>
        <button
          onClick={props.onNewSession}
          className={[
            "flex-shrink-0 flex items-center justify-center rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white transition-colors",
            isCompact ? "h-7 w-7" : "h-9 w-9",
          ].join(" ")}
          title={props.newSessionTitle ?? "Quick Connect"}
        >
          <PlugZap className={isCompact ? "size-3.5" : "size-4"} />
        </button>
      </DndContext>
      </div>

      <WindowControls />

      {menu.open && menu.tabId ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu({ open: false, x: 0, y: 0, tabId: null })} />
          <div
            className="fixed z-50 w-[170px] rounded border border-[var(--color-gray-700)] bg-[var(--color-gray-800)] shadow-lg overflow-hidden"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {props.onDuplicateTab ? (
              <button
                onClick={() => {
                  props.onDuplicateTab?.(menu.tabId!);
                  setMenu({ open: false, x: 0, y: 0, tabId: null });
                }}
                className="w-full text-left text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)] flex items-center gap-2 px-3 py-2 text-sm"
              >
                <Copy className="size-3" />
                {props.duplicateLabel ?? "Duplicate tab"}
              </button>
            ) : null}
            <button
              onClick={() => {
                props.onClose(menu.tabId!);
                setMenu({ open: false, x: 0, y: 0, tabId: null });
              }}
              className="w-full text-left text-red-300 hover:bg-[var(--color-gray-700)] flex items-center gap-2 px-3 py-2 text-sm"
            >
              <X className="size-3" />
              {props.closeLabel ?? "Close"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
