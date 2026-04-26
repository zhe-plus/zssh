import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { Group, SessionPublic, UUID } from "../types";
import { ChevronDown, ChevronRight, MoreVertical, PanelLeft, PanelLeftClose, Pencil, Plus, Search, Server, Settings, Star, Trash2, GripVertical } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay, closestCenter, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { t } from "../lib/i18n";
import { isCompactLayout } from "../lib/layout";

// ========================
// 类型定义
// ========================

interface SidebarProps {
  groups: Group[];
  sessions: SessionPublic[];
  activeSessionIds: UUID[];
  collapsed: boolean;
  layoutMode: string;
  lang?: string;
  onToggleCollapse: () => void;
  onGroupNew: () => void;
  onGroupRename: (id: UUID) => void;
  onGroupDelete: (id: UUID) => void;
  onGroupReorder: (ids: UUID[]) => void;
  onNew: () => void;
  onEdit: (id: UUID) => void;
  onDelete: (id: UUID) => void;
  onOpen: (id: UUID) => void;
  onToggleFavorite: (id: UUID) => void;
  onOpenSettings: () => void;
  onMoveSessionToGroup?: (sessionId: UUID, targetGroupId: UUID | null) => Promise<void>;
  onReorderSessionsInGroup?: (groupId: UUID | null, sessionIds: UUID[]) => Promise<void>;
}

// ========================
// 公共子组件：下拉菜单（复用）
// ========================

function DropdownMenu(props: {
  items: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }[];
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={props.buttonClassName ?? "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-gray-700)] rounded p-1"}
      >
        <MoreVertical className="size-3" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded shadow-lg z-20 min-w-[120px] overflow-hidden">
            {props.items.map((item) => (
              <button
                key={item.label}
                onClick={(e) => { e.stopPropagation(); item.onClick(); setOpen(false); }}
                className={[
                  "w-full text-left flex items-center gap-2 px-3 py-2 text-sm",
                  item.danger ? "text-red-400" : "text-[var(--color-gray-300)]",
                  "hover:bg-[var(--color-gray-700)]",
                ].join(" ")}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ========================
// 分组标题
// ========================

function SectionHeader(props: {
  id: string;
  title: string;
  count: number;
  expanded: boolean;
  icon: ReactNode;
  onToggle: (id: string) => void;
  menu?: ReactNode;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      className="flex items-center gap-2 cursor-pointer hover:bg-[var(--color-gray-800)] px-3 py-2"
      onClick={() => props.onToggle(props.id)}
      {...props.dragHandleProps}
    >
      {props.expanded ? <ChevronDown className="size-4 text-[var(--color-gray-400)]" /> : <ChevronRight className="size-4 text-[var(--color-gray-400)]" />}
      {props.icon}
      <span className="text-sm text-[var(--color-gray-300)]">{props.title}</span>
      <div className="ml-auto flex items-center gap-1">
        <span className="text-xs text-[var(--color-gray-500)]">{props.count}</span>
        {props.menu}
      </div>
    </div>
  );
}

// ========================
// 可放置区域包装器
// ========================

function DroppableZone(props: { id: string; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `group-${props.id}` });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "bg-[color-mix(in_oklab,var(--color-blue-600)_15%,transparent)] rounded-md transition-colors duration-150 mx-1" : ""}
    >
      {props.children}
    </div>
  );
}

// ========================
// 会话项内部组件
// ========================

const SessionItemWrapper = function SessionItemWrapper(
  props: {
    session: SessionPublic;
    active: boolean;
    isCompact: boolean;
    lang: string;
    showDragHandle?: boolean;
    isDragging?: boolean;
    onOpen: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onToggleFavorite: () => void;
    dragHandleProps?: Record<string, unknown>;
    style?: React.CSSProperties;
  } & { ref?: React.Ref<HTMLDivElement> }
) {
  const s = props.session;

  const menuItems = useMemo(() => [
    { label: t(props.lang, "edit"), icon: <Pencil className="size-3" />, onClick: props.onEdit },
    { label: t(props.lang, "delete"), icon: <Trash2 className="size-3" />, onClick: props.onDelete, danger: true },
  ], [props.lang, props.onEdit, props.onDelete]);

  return (
    <div
      ref={props.ref}
      style={props.style}
      {...props.dragHandleProps}
      className={[
        "flex items-center gap-2 cursor-pointer group relative mx-2 rounded",
        props.isCompact ? "px-2 py-1.5" : "px-2.5 py-2",
        props.showDragHandle ? "cursor-grab active:cursor-grabbing" : "",
        props.active
          ? "bg-[color-mix(in_oklab,var(--color-blue-600)_25%,transparent)] text-white border border-[color-mix(in_oklab,var(--color-blue-600)_35%,var(--color-gray-800))]"
          : props.isDragging
            ? "border-2 border-dashed border-[var(--color-blue-500)] bg-[color-mix(in_oklab,var(--color-blue-500)_10%,transparent)] text-white"
            : "hover:bg-[var(--color-gray-800)] text-[var(--color-gray-300)] border border-transparent",
      ].join(" ")}
      onDoubleClick={props.onOpen}
    >
      {/* 拖拽图标（视觉提示） */}
      {props.showDragHandle && (
        <div className="opacity-40 group-hover:opacity-100 shrink-0">
          <GripVertical className="size-3.5 text-[var(--color-gray-500)]" />
        </div>
      )}
      {/* 状态指示点 */}
      <div className={[
        "rounded-full size-2 shrink-0",
        props.active ? "bg-[var(--color-blue-500)]" : s.favorite ? "bg-yellow-500" : "bg-[var(--color-gray-600)]",
      ].join(" ")} />
      {/* 名称和地址 */}
      <div className="flex-1 min-w-0">
        <div className={["truncate", props.isCompact ? "text-xs" : "text-sm"].join(" ")}>{s.name}</div>
        <div className={["truncate text-xs", props.active ? "text-[color-mix(in_oklab,var(--color-blue-500)_70%,white)]" : "text-[var(--color-gray-500)]"].join(" ")}>
          {s.username}@{s.host}:{s.port}
        </div>
      </div>
      {/* 操作按钮 */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); props.onToggleFavorite(); }}
          className="opacity-0 group-hover:opacity-100 hover:bg-[var(--color-gray-700)] rounded p-1"
        >
          <Star className={["size-3", s.favorite ? "text-yellow-500 fill-yellow-500" : props.active ? "text-white" : "text-[var(--color-gray-400)]"].join(" ")} />
        </button>
        <DropdownMenu
          items={menuItems}
          buttonClassName="opacity-0 group-hover:opacity-100 hover:bg-[var(--color-gray-700)] rounded p-1"
        />
      </div>
    </div>
  );
};

// ========================
// 可拖动的会话项
// ========================

function SortableSessionItem(props: {
  id: string;
  session: SessionPublic;
  active: boolean;
  isCompact: boolean;
  lang: string;
  isDragging: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });

  // DragOverlay 模式：拖拽时隐藏原元素，幽灵元素由 DragOverlay 渲染
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    position: isDragging ? "absolute" as const : undefined,
    pointerEvents: isDragging ? "none" as const : undefined,
  };

  return (
    <SessionItemWrapper
      ref={setNodeRef}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
      session={props.session}
      active={props.active}
      isCompact={props.isCompact}
      lang={props.lang}
      showDragHandle={!isDragging}
      isDragging={isDragging || props.isDragging}
      onOpen={props.onOpen}
      onEdit={props.onEdit}
      onDelete={props.onDelete}
      onToggleFavorite={props.onToggleFavorite}
    />
  );
}

// ========================
// 可拖放分组区域
// ========================

function DroppableGroupSection(props: {
  group: Group;
  sessions: SessionPublic[];
  expanded: boolean;
  isCompact: boolean;
  lang: string;
  activeSessionIds: UUID[];
  activeDragId: string | null;
  onToggle: (id: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onOpen: (id: UUID) => void;
  onEdit: (id: UUID) => void;
  onDeleteSession: (id: UUID) => void;
  onToggleFavorite: (id: UUID) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isGroupDragging } = useSortable({ id: props.group.id });
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: `group-${props.group.id}` });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isGroupDragging ? 0.6 : 1,
  };

  const menuItems = [
    { label: t(props.lang, "rename"), icon: <Pencil className="size-3" />, onClick: props.onRename },
    { label: t(props.lang, "delete"), icon: <Trash2 className="size-3" />, onClick: props.onDelete, danger: true },
  ];

  return (
    <div ref={setNodeRef} style={style} className="border-b border-[var(--color-gray-800)]">
      {/* 分组标题 — 拖拽手柄仅绑定到标题行 */}
      <div
        className={isOver && !isGroupDragging ? "bg-[color-mix(in_oklab,var(--color-blue-600)_15%,transparent)] transition-colors duration-150" : ""}
        {...attributes}
        {...listeners}
      >
        <SectionHeader
          id={props.group.id}
          title={props.group.name}
          count={props.sessions.length}
          expanded={props.expanded}
          icon={<Server className={["text-[var(--color-gray-400)]", props.isCompact ? "size-3" : "size-4"].join(" ")} />}
          onToggle={props.onToggle}
          dragHandleProps={{ ...(isGroupDragging ? {} : { style: { cursor: "grab" } }) }}
          menu={
            <DropdownMenu
              items={menuItems}
              buttonClassName="hover:bg-[var(--color-gray-700)] rounded p-1 text-[var(--color-gray-400)]"
            />
          }
        />
      </div>

      {/* 会话列表（可放置目标） */}
      {props.expanded && (
        <div ref={setDropRef} className={isOver ? "bg-[color-mix(in_oklab,var(--color-blue-600)_12%,transparent)] pb-2" : "pb-2"}>
          <SortableContext items={props.sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {props.sessions.map((s) => (
              <SortableSessionItem
                key={s.id}
                id={s.id}
                session={s}
                active={props.activeSessionIds.includes(s.id)}
                isCompact={props.isCompact}
                lang={props.lang}
                isDragging={props.activeDragId === s.id}
                onOpen={() => props.onOpen(s.id)}
                onEdit={() => props.onEdit(s.id)}
                onDelete={() => props.onDeleteSession(s.id)}
                onToggleFavorite={() => props.onToggleFavorite(s.id)}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

// ========================
// 拖拽幽灵元素
// ========================

function SessionDragOverlay(props: { session: SessionPublic; isCompact: boolean }) {
  const s = props.session;
  return (
    <div
      className={[
        "flex items-center gap-2 rounded shadow-xl mx-2",
        props.isCompact ? "px-2 py-1.5" : "px-2.5 py-2",
        "bg-[var(--color-gray-800)] border-2 border-[var(--color-blue-500)] text-white cursor-grabbing",
      ].join(" ")}
    >
      <GripVertical className="size-3.5 text-[var(--color-gray-400)] shrink-0" />
      <div className="rounded-full size-2 bg-[var(--color-blue-500)] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={["truncate", props.isCompact ? "text-xs" : "text-sm"].join(" ")}>{s.name}</div>
        <div className="truncate text-xs text-[var(--color-gray-500)]">{s.username}@{s.host}:{s.port}</div>
      </div>
    </div>
  );
}

// ========================
// 主组件
// ========================

export function Sidebar(props: SidebarProps) {
  const isCompact = isCompactLayout(props.layoutMode);
  const lang = props.lang ?? "zh-CN";

  // ---- 状态 ----
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() =>
    ["favorites", ...props.groups.map((g) => g.id), "ungrouped"]
  );

  // ---- 派生数据 ----
  const groupOrder = useMemo(
    () => [...props.groups].sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name)),
    [props.groups]
  );

  const sessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? props.sessions.filter((s) => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q))
      : props.sessions;
    return [...filtered].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0) || a.name.localeCompare(b.name);
    });
  }, [props.sessions, searchQuery]);

  const favorites = useMemo(() => sessions.filter((s) => s.favorite), [sessions]);
  const ungroupedSessions = useMemo(() => sessions.filter((s) => !s.groupId), [sessions]);
  const activeDragSession = useMemo(
    () => (activeDragId ? sessions.find((s) => s.id === activeDragId) : undefined),
    [activeDragId, sessions]
  );

  // ---- 布局常量 ----
  const collapsedWidth = isCompact ? 40 : 48;
  const expandedWidth = isCompact ? 224 : 256;

  // ---- DnD 配置 ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ---- 回调函数 ----
  const toggleExpanded = useCallback((id: string) => {
    setExpandedGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleDragStart = useCallback((evt: DragStartEvent) => {
    setActiveDragId(String(evt.active.id));
  }, []);

  const handleDragEnd = useCallback(async (evt: DragEndEvent) => {
    const { active, over } = evt;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // 分组拖拽排序
    if (groupOrder.some((g) => g.id === activeId)) {
      const ids = groupOrder.map((g) => g.id);
      const next = arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId)) as UUID[];
      props.onGroupReorder(next);
      return;
    }

    // 会话拖拽
    const draggedSession = sessions.find((s) => s.id === activeId);
    if (!draggedSession) return;

    // 放到分组上 → 移动到该分组
    const targetGroup = groupOrder.find((g) => `group-${g.id}` === overId);
    if (targetGroup) { await props.onMoveSessionToGroup?.(activeId, targetGroup.id); return; }
    // 放到未分组区域 → 移除分组
    if (overId === "group-ungrouped") { await props.onMoveSessionToGroup?.(activeId, null); return; }
    // 放到收藏区域 → 忽略
    if (overId === "group-favorites") return;

    // 放到另一个会话上
    const targetSession = sessions.find((s) => s.id === overId);
    if (!targetSession) return;

    if (draggedSession.groupId === targetSession.groupId) {
      // 同组内重排
      const groupId = draggedSession.groupId;
      const groupSessionIds = sessions
        .filter((s) => groupId ? s.groupId === groupId : !s.groupId)
        .map((s) => s.id);
      const reordered = arrayMove(groupSessionIds, groupSessionIds.indexOf(activeId), groupSessionIds.indexOf(overId)) as UUID[];
      await props.onReorderSessionsInGroup?.(groupId, reordered);
    } else {
      // 跨组移动
      await props.onMoveSessionToGroup?.(activeId, targetSession.groupId);
    }
  }, [groupOrder, sessions, props]);

  // ---- 图标尺寸工具 ----
  const sz = { sm: isCompact ? "size-3" : "size-3.5", md: isCompact ? "size-3.5" : "size-4", lg: isCompact ? "size-3.5" : "size-4" };

  // ---- 渲染会话列表（收藏/未分组共用） ----
  function renderSessionList(list: SessionPublic[]) {
    return (
      <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="pb-2">
          {list.map((s) => (
            <SortableSessionItem
              key={s.id}
              id={s.id}
              session={s}
              active={props.activeSessionIds.includes(s.id)}
              isCompact={isCompact}
              lang={lang}
              isDragging={activeDragId === s.id}
              onOpen={() => props.onOpen(s.id)}
              onEdit={() => props.onEdit(s.id)}
              onDelete={() => props.onDelete(s.id)}
              onToggleFavorite={() => props.onToggleFavorite(s.id)}
            />
          ))}
        </div>
      </SortableContext>
    );
  }

  // ========================
  // JSX
  // ========================
  return (
    <div
      className="h-full bg-[var(--color-gray-900)] border-r border-[var(--color-gray-800)] flex flex-col shrink-0 overflow-hidden transition-all duration-200 ease-in-out"
      style={{ width: props.collapsed ? collapsedWidth : expandedWidth }}
    >
      {/* ===== 折叠工具栏 ===== */}
      <div className={["flex flex-col items-center", isCompact ? "py-2" : "py-3", props.collapsed ? "" : "hidden"].join(" ")}>
        <IconButton icon={<PanelLeft className={sz.md} />} title={t(lang, "shortcutToggleSidebar")} onClick={props.onToggleCollapse} compact={isCompact} />
        <IconButton icon={<Plus className={sz.md} />} title={t(lang, "addConnection")} onClick={props.onNew} compact={isCompact} />
        <div className="flex-1" />
        <IconButton icon={<Settings className={sz.md} />} title={t(lang, "settings")} onClick={props.onOpenSettings} compact={isCompact} mb />
      </div>

      {/* ===== 展开内容区 ===== */}
      <div className={[props.collapsed ? "hidden" : "flex", "flex-col flex-1 min-h-0 overflow-hidden"].join(" ")}>
        {/* 标题栏 + 按钮 */}
        <header className="border-b border-[var(--color-gray-800)] flex items-center justify-between shrink-0 px-3 py-2">
          <span className={["font-medium text-white", isCompact ? "text-xs" : "text-sm"].join(" ")}>{t(lang, "sidebarSessions")}</span>
          <div className="flex gap-1">
            <IconButton icon={<Server className={sz.sm} />} title={t(lang, "newGroup")} onClick={props.onGroupNew} compact={isCompact} sm />
            <IconButton icon={<Plus className={sz.sm} />} title={t(lang, "addConnection")} onClick={props.onNew} compact={isCompact} sm />
            <IconButton icon={<PanelLeftClose className={sz.sm} />} title={t(lang, "shortcutToggleSidebar")} onClick={props.onToggleCollapse} compact={isCompact} sm />
          </div>
        </header>

        {/* 搜索栏 */}
        <div className={["border-b border-[var(--color-gray-800)]", isCompact ? "p-2" : "p-3"].join(" ")}>
          <div className="relative">
            <Search className={["absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-gray-500)]", sz.md].join(" ")} />
            <input
              type="text"
              placeholder={t(lang, "sidebarSearchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              className={[
                "w-full pr-3 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]",
                isCompact ? "pl-7 py-1 text-xs" : "pl-8 py-1.5 text-sm",
              ].join(" ")}
            />
          </div>
        </div>

        {/* 会话列表（支持拖拽排序） */}
        <main className="flex-1 overflow-y-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* 收藏区域 */}
            {favorites.length > 0 && (
              <>
                <SectionHeader
                  id="favorites"
                  title={t(lang, "sidebarFavorites")}
                  count={favorites.length}
                  expanded={expandedGroups.includes("favorites")}
                  icon={<Star className={["text-yellow-500 fill-yellow-500", sz.sm].join(" ")} />}
                  onToggle={toggleExpanded}
                />
                {expandedGroups.includes("favorites") && renderSessionList(favorites)}
              </>
            )}

            {/* 分组列表 */}
            <SortableContext items={groupOrder.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              {groupOrder.map((g) => (
                <DroppableGroupSection
                  key={g.id}
                  group={g}
                  sessions={sessions.filter((s) => s.groupId === g.id)}
                  expanded={expandedGroups.includes(g.id)}
                  isCompact={isCompact}
                  lang={lang}
                  activeSessionIds={props.activeSessionIds}
                  activeDragId={activeDragId}
                  onToggle={toggleExpanded}
                  onRename={() => props.onGroupRename(g.id)}
                  onDelete={() => props.onGroupDelete(g.id)}
                  onOpen={props.onOpen}
                  onEdit={props.onEdit}
                  onDeleteSession={props.onDelete}
                  onToggleFavorite={props.onToggleFavorite}
                />
              ))}
            </SortableContext>

            {/* 未分组区域 */}
            {ungroupedSessions.length > 0 && (
              <DroppableZone id="ungrouped">
                <div className="border-b border-[var(--color-gray-800)]">
                  <SectionHeader
                    id="ungrouped"
                    title={t(lang, "sidebarUngrouped")}
                    count={ungroupedSessions.length}
                    expanded={expandedGroups.includes("ungrouped")}
                    icon={<Server className={["text-[var(--color-gray-400)]", sz.sm].join(" ")} />}
                    onToggle={toggleExpanded}
                  />
                  {expandedGroups.includes("ungrouped") && renderSessionList(ungroupedSessions)}
                </div>
              </DroppableZone>
            )}

            {/* 拖拽幽灵 */}
            <DragOverlay>
              {activeDragSession && <SessionDragOverlay session={activeDragSession} isCompact={isCompact} />}
            </DragOverlay>
          </DndContext>
        </main>

        {/* 底部设置按钮 */}
        <footer className="border-t border-[var(--color-gray-800)] p-3 shrink-0">
          <button
            onClick={props.onOpenSettings}
            className="w-full rounded flex items-center gap-2 text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-[var(--color-gray-300)] transition-colors px-3 py-2"
          >
            <Settings className={sz.md} />
            <span className="text-sm">{t(lang, "settings")}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

// ========================
// 图标按钮（减少重复的 className）
// ========================

function IconButton(props: {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  compact?: boolean;
  sm?: boolean;
  mb?: boolean;
}) {
  const p = props.sm ? (props.compact ? "p-1" : "p-1.5") : (props.compact ? "p-1.5" : "p-2");
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      className={["hover:bg-[var(--color-gray-800)] rounded text-[var(--color-gray-400)]", p, props.mb && !props.sm ? (props.compact ? "mb-2" : "mb-3") : ""].join(" ").trim()}
    >
      {props.icon}
    </button>
  );
}
