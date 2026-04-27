import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { 
  Search, Plus, Trash2, Star, RotateCcw, Edit2, X, Check, 
  ChevronDown, Terminal, Bookmark, History
} from "lucide-react";
import { t } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import {
  type CommandItem,
  type SortOrder,
  type FilterSource,
  getCommandList,
  addCustomCommand,
  updateCustomCommand,
  deleteCustomCommand,
  deleteCustomCommands,
  toggleSystemCommandDisabled,
  resetSystemCommands,
  addHistoryToCustom,
  clearCustomCommands,
  clearHistory,
} from "../lib/commandHistory";

export interface CommandManagerProps {
  open: boolean;
  lang: Lang;
  onSelect: (command: string) => void;
  onClose: () => void;
}

type TabType = 'system' | 'custom' | 'history';

interface EditState {
  id: string;
  command: string;
  displayName: string;
}

export function CommandManager({ open, lang, onSelect, onClose }: CommandManagerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('system');
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOrder>('time');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<EditState | null>(null);
  const [addForm, setAddForm] = useState({ command: "", displayName: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // 获取命令列表
  const commands = useMemo(() => {
    const filterSource: FilterSource = activeTab === 'system' ? 'system' 
      : activeTab === 'custom' ? 'custom' 
      : 'history';
    return getCommandList({
      source: filterSource,
      query,
      sortBy: activeTab === 'system' ? 'name' : sortBy,
      sortOrder: 'desc',
    });
  }, [activeTab, query, sortBy]);

  // 聚焦搜索框
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  // 打开添加表单时聚焦
  useEffect(() => {
    if (showAddForm) {
      setTimeout(() => addInputRef.current?.focus(), 50);
    }
  }, [showAddForm]);

  // 重置状态
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIds(new Set());
      setEditState(null);
      setAddForm({ command: "", displayName: "" });
      setShowAddForm(false);
      setActiveTab('system');
    }
  }, [open]);

  // 全选状态
  const allSelected = useMemo(() => {
    const editableItems = commands.filter(c => c.source !== 'system');
    return editableItems.length > 0 && editableItems.every(c => selectedIds.has(c.id));
  }, [commands, selectedIds]);

  // 切换选中
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    const editableItems = commands.filter(c => c.source !== 'system');
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(editableItems.map(c => c.id)));
    }
  }, [commands, allSelected]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (editState) {
        setEditState(null);
      } else if (showAddForm) {
        setShowAddForm(false);
        setAddForm({ command: "", displayName: "" });
      } else {
        onClose();
      }
    }
  }, [editState, showAddForm, onClose]);

  // 添加自定义命令
  const handleAdd = useCallback(() => {
    const cmd = addForm.command.trim();
    if (!cmd) return;
    addCustomCommand(cmd, addForm.displayName.trim() || undefined);
    setAddForm({ command: "", displayName: "" });
    setShowAddForm(false);
  }, [addForm]);

  // 保存编辑
  const handleSaveEdit = useCallback(() => {
    if (!editState) return;
    const cmd = editState.command.trim();
    if (!cmd) return;
    updateCustomCommand(editState.id, {
      command: cmd,
      displayName: editState.displayName.trim() || undefined,
    });
    setEditState(null);
  }, [editState]);

  // 删除选中
  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    deleteCustomCommands(ids);
    setSelectedIds(new Set());
  }, [selectedIds]);

  // 删除单个（自定义）
  const handleDeleteSingle = useCallback((id: string) => {
    deleteCustomCommand(id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // 清空自定义命令
  const handleClearCustom = useCallback(() => {
    if (window.confirm(t(lang, 'confirmClearCustomCommands') || '确认清空所有自定义命令？')) {
      clearCustomCommands();
      setSelectedIds(new Set());
    }
  }, [lang]);

  // 清空历史记录
  const handleClearHistory = useCallback(() => {
    if (window.confirm(t(lang, 'confirmClearHistory') || '确认清空所有历史记录？')) {
      clearHistory();
    }
  }, [lang]);

  // 恢复默认系统命令
  const handleResetSystem = useCallback(() => {
    if (window.confirm(t(lang, 'confirmResetSystemCommands') || '确认恢复默认系统命令？')) {
      resetSystemCommands();
    }
  }, [lang]);

  // 添加历史到自定义
  const handleAddToCustom = useCallback((item: CommandItem) => {
    const result = addHistoryToCustom(item.id, item.command);
    if (result) {
      setActiveTab('custom');
    }
  }, []);

  // 选择命令
  const handleSelect = useCallback((command: string) => {
    onSelect(command);
  }, [onSelect]);

  // 切换系统命令禁用状态
  const handleToggleSystemDisabled = useCallback((id: string, currentDisabled: boolean) => {
    toggleSystemCommandDisabled(id, !currentDisabled);
  }, []);

  // 渲染排序下拉
  const renderSortDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)]"
      >
        <span>{t(lang, 'sortBy' + sortBy.charAt(0).toUpperCase() + sortBy.slice(1) as any) || sortBy}</span>
        <ChevronDown className="size-3" />
      </button>
      {sortDropdownOpen && (
        <div className="absolute right-0 top-full mt-1 py-1 w-28 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded shadow-lg z-10">
          <button
            onClick={() => { setSortBy('time'); setSortDropdownOpen(false); }}
            className={`w-full px-3 py-1.5 text-xs text-left hover:bg-[var(--color-gray-700)] ${sortBy === 'time' ? 'text-blue-400' : 'text-[var(--color-gray-300)]'}`}
          >
            {t(lang, 'sortByTime')}
          </button>
          <button
            onClick={() => { setSortBy('usage'); setSortDropdownOpen(false); }}
            className={`w-full px-3 py-1.5 text-xs text-left hover:bg-[var(--color-gray-700)] ${sortBy === 'usage' ? 'text-blue-400' : 'text-[var(--color-gray-300)]'}`}
          >
            {t(lang, 'sortByUsage')}
          </button>
          <button
            onClick={() => { setSortBy('name'); setSortDropdownOpen(false); }}
            className={`w-full px-3 py-1.5 text-xs text-left hover:bg-[var(--color-gray-700)] ${sortBy === 'name' ? 'text-blue-400' : 'text-[var(--color-gray-300)]'}`}
          >
            {t(lang, 'sortByName')}
          </button>
        </div>
      )}
    </div>
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="w-[700px] max-w-full h-[70vh] bg-[var(--color-gray-900)] border border-[var(--color-gray-800)] rounded-lg shadow-xl flex flex-col overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="h-11 px-4 border-b border-[var(--color-gray-800)] flex items-center gap-3 shrink-0">
          <Terminal className="size-4 text-[var(--color-gray-400)]" />
          <div className="font-medium text-sm text-white">{t(lang, 'commandManagerTitle') || '命令管理'}</div>
          <button
            className="ml-auto p-1 rounded text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-white"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-gray-800)] shrink-0">
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
              activeTab === 'system' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-[var(--color-gray-400)] hover:text-white'
            }`}
          >
            <Bookmark className="size-3.5" />
            {t(lang, 'systemCommands') || '系统命令'}
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
              activeTab === 'custom' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-[var(--color-gray-400)] hover:text-white'
            }`}
          >
            <Star className="size-3.5" />
            {t(lang, 'customCommands') || '自定义命令'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
              activeTab === 'history' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-[var(--color-gray-400)] hover:text-white'
            }`}
          >
            <History className="size-3.5" />
            {t(lang, 'commandHistory') || '历史记录'}
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-gray-800)] shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-gray-500)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(lang, 'searchPlaceholder') || '搜索...'}
              className="w-full h-8 pl-7 pr-3 rounded bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-sm text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-blue-500"
            />
          </div>
          {activeTab !== 'system' && renderSortDropdown()}
          <span className="text-xs text-[var(--color-gray-500)] tabular-nums">{commands.length}</span>
        </div>

        {/* Add Form */}
        {showAddForm && activeTab === 'custom' && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-gray-800)] bg-[var(--color-gray-850)] shrink-0">
            <input
              ref={addInputRef}
              type="text"
              value={addForm.command}
              onChange={(e) => setAddForm(prev => ({ ...prev, command: e.target.value }))}
              placeholder={t(lang, 'commandContentPlaceholder') || '命令内容'}
              className="flex-1 h-8 px-3 rounded bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-sm text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={addForm.displayName}
              onChange={(e) => setAddForm(prev => ({ ...prev, displayName: e.target.value }))}
              placeholder={t(lang, 'displayName') || '显示名称(可选)'}
              className="w-36 h-8 px-3 rounded bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-sm text-white placeholder:text-[var(--color-gray-500)] outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAdd}
              className="px-3 h-8 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-1"
            >
              <Check className="size-3.5" />
              {t(lang, 'save') || '保存'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddForm({ command: "", displayName: "" }); }}
              className="p-2 h-8 rounded bg-[var(--color-gray-800)] text-[var(--color-gray-400)] hover:text-white flex items-center"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {commands.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--color-gray-500)]">
              {t(lang, 'commandPaletteNoResults') || '无匹配命令'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-[var(--color-gray-900)]">
                <tr className="text-xs text-[var(--color-gray-500)] border-b border-[var(--color-gray-800)]">
                  {activeTab !== 'system' && (
                    <th className="w-8 px-2 py-1.5 text-left">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="size-3.5 rounded border-[var(--color-gray-600)]"
                      />
                    </th>
                  )}
                  <th className="px-3 py-1.5 text-left">{t(lang, 'commandCol') || '命令'}</th>
                  <th className="w-24 px-3 py-1.5 text-left">{t(lang, 'sourceCol') || '来源'}</th>
                  <th className="w-20 px-3 py-1.5 text-right">{t(lang, 'usageCol') || '使用'}</th>
                  <th className="w-20 px-3 py-1.5 text-right">{t(lang, 'actionsCol') || '操作'}</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((item) => (
                  <tr 
                    key={item.id}
                    className={`border-b border-[var(--color-gray-800)]/50 hover:bg-[var(--color-gray-800)]/30 transition-colors ${
                      item.disabled ? 'opacity-50' : ''
                    } ${selectedIds.has(item.id) ? 'bg-blue-600/10' : ''}`}
                  >
                    {activeTab !== 'system' && (
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="size-3.5 rounded border-[var(--color-gray-600)]"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {editState?.id === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editState.command}
                            onChange={(e) => setEditState(prev => prev ? { ...prev, command: e.target.value } : null)}
                            className="flex-1 h-7 px-2 rounded bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] text-sm text-white outline-none focus:border-blue-500 font-mono"
                          />
                        </div>
                      ) : (
                        <div 
                          className="font-mono text-sm text-[var(--color-gray-200)] cursor-pointer hover:text-blue-400 truncate"
                          onClick={() => !item.disabled && handleSelect(item.command)}
                        >
                          {highlightQuery(item.command, query)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        item.source === 'system' 
                          ? 'bg-purple-500/20 text-purple-400' 
                          : item.source === 'custom'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {item.source === 'system' 
                          ? (t(lang, 'systemCommand') || '系统')
                          : item.source === 'custom'
                          ? (t(lang, 'customCommand') || '自定义')
                          : (t(lang, 'historyCommand') || '历史')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.usageCount > 0 && (
                        <span className="text-xs text-[var(--color-gray-500)] tabular-nums">
                          {item.usageCount}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {item.source === 'system' ? (
                          <button
                            onClick={() => handleToggleSystemDisabled(item.id, item.disabled || false)}
                            className={`p-1.5 rounded hover:bg-[var(--color-gray-700)] ${
                              item.disabled ? 'text-[var(--color-gray-500)]' : 'text-[var(--color-gray-400)]'
                            }`}
                            title={item.disabled ? t(lang, 'enable') : t(lang, 'disable')}
                          >
                            {item.disabled ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                          </button>
                        ) : editState?.id === item.id ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              className="p-1.5 rounded hover:bg-[var(--color-gray-700)] text-green-400"
                              title={t(lang, 'save')}
                            >
                              <Check className="size-3.5" />
                            </button>
                            <button
                              onClick={() => setEditState(null)}
                              className="p-1.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-400)]"
                              title={t(lang, 'cancel')}
                            >
                              <X className="size-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            {item.source === 'history' && (
                              <button
                                onClick={() => handleAddToCustom(item)}
                                className="p-1.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-400)] hover:text-blue-400"
                                title={t(lang, 'addToCustom')}
                              >
                                <Star className="size-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditState({ 
                                id: item.id, 
                                command: item.command, 
                                displayName: item.displayName || '' 
                              })}
                              className="p-1.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-400)]"
                              title={t(lang, 'edit')}
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSingle(item.id)}
                              className="p-1.5 rounded hover:bg-[var(--color-gray-700)] text-[var(--color-gray-400)] hover:text-red-400"
                              title={t(lang, 'delete')}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-gray-800)] shrink-0">
          <div className="flex items-center gap-2">
            {activeTab === 'custom' && (
              <>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
                >
                  <Plus className="size-3.5" />
                  {t(lang, 'add')}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-600/20 text-red-400 text-xs hover:bg-red-600/30"
                  >
                    <Trash2 className="size-3.5" />
                    {t(lang, 'deleteSelected') || '删除选中'}
                  </button>
                )}
                <button
                  onClick={handleClearCustom}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--color-gray-800)] text-[var(--color-gray-400)] text-xs hover:bg-[var(--color-gray-700)] hover:text-white"
                >
                  {t(lang, 'clearAll') || '清空全部'}
                </button>
              </>
            )}
            {activeTab === 'history' && (
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-600/20 text-red-400 text-xs hover:bg-red-600/30"
              >
                <Trash2 className="size-3.5" />
                {t(lang, 'clearHistory')}
              </button>
            )}
            {activeTab === 'system' && (
              <button
                onClick={handleResetSystem}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--color-gray-800)] text-[var(--color-gray-400)] text-xs hover:bg-[var(--color-gray-700)] hover:text-white"
              >
                <RotateCcw className="size-3.5" />
                {t(lang, 'resetDefault')}
              </button>
            )}
          </div>
          <div className="flex gap-3 text-[10px] text-[var(--color-gray-500)]">
            <span>↑↓ Navigate</span>
            <span>Enter {t(lang, 'select') || '选择'}</span>
            <span>Esc {t(lang, 'close') || '关闭'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 高亮匹配的搜索词 */
function highlightQuery(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, i) => 
      part.toLowerCase() === q.toLowerCase() 
        ? <mark key={i} className="bg-yellow-500/30 text-yellow-300 rounded px-0.5">{part}</mark>
        : part
    );
  } catch {
    return text;
  }
}
