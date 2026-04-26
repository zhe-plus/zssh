/**
 * 命令管理模块 - 整合系统命令、自定义命令和历史记录
 */

export type CommandSource = 'system' | 'custom' | 'history';

export interface CommandItem {
  id: string;
  command: string;
  displayName?: string;
  source: CommandSource;
  usageCount: number;
  lastUsedAt?: number;
  createdAt: number;
  disabled?: boolean; // 系统命令可禁用但不可删除
}

// 原有命令历史条目
export interface CommandEntry {
  id: string;
  sessionId: string;
  command: string;
  timestamp: number;
}

// ========== 存储键 ==========
const STORAGE_KEY_HISTORY = "zssh:cmd_history";
const STORAGE_KEY_CUSTOM = "zssh:custom_commands";
const STORAGE_KEY_SYSTEM_DISABLED = "zssh:system_commands_disabled";

const MAX_HISTORY_TOTAL = 2000;
const MAX_HISTORY_PER_SESSION = 500;

// ========== 系统命令定义 ==========
export interface SystemCommand {
  id: string;
  command: string;
  displayNameKey: string;
}

export const SYSTEM_COMMANDS: SystemCommand[] = [
  { id: "sys-pwd", command: "pwd", displayNameKey: "commonCmdPwd" },
  { id: "sys-ls-la", command: "ls -la", displayNameKey: "commonCmdLsLa" },
  { id: "sys-whoami", command: "whoami", displayNameKey: "commonCmdWhoami" },
  { id: "sys-uname-a", command: "uname -a", displayNameKey: "commonCmdUnameA" },
  { id: "sys-df-h", command: "df -h", displayNameKey: "commonCmdDfH" },
  { id: "sys-free-h", command: "free -h", displayNameKey: "commonCmdFreeH" },
  { id: "sys-ps-head", command: "ps aux | head", displayNameKey: "commonCmdPsHead" },
  { id: "sys-ip-a", command: "ip a", displayNameKey: "commonCmdIpA" },
  { id: "sys-clear", command: "clear", displayNameKey: "commonCmdClear" },
  { id: "sys-tail-f", command: "tail -f /var/log/syslog", displayNameKey: "commonCmdTailF" },
  { id: "sys-grep", command: "grep -r \"keyword\" .", displayNameKey: "commonCmdGrep" },
  { id: "sys-top", command: "top -c", displayNameKey: "commonCmdTop" },
  { id: "sys-netstat", command: "netstat -tuln", displayNameKey: "commonCmdNetstat" },
  { id: "sys-htop", command: "htop", displayNameKey: "commonCmdHtop" },
  { id: "sys-find", command: "find . -name \"*.log\"", displayNameKey: "commonCmdFind" },
];

// ========== 历史记录相关函数 ==========
function loadHistory(): CommandEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw) as CommandEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: CommandEntry[]): void {
  try {
    const trimmed = entries.length > MAX_HISTORY_TOTAL 
      ? entries.slice(entries.length - MAX_HISTORY_TOTAL) 
      : entries;
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable
  }
}

/** 添加命令到历史记录 */
export function addCommand(sessionId: string, cmd: string): void {
  const s = cmd.trim();
  if (!s) return;

  const entries = loadHistory();

  // 去重：移除同一会话中的相同命令
  const last = entries[entries.length - 1];
  if (last && last.sessionId === sessionId && last.command === s) return;

  entries.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    command: s,
    timestamp: Date.now(),
  });

  saveHistory(entries);
}

/** 搜索历史记录 */
export function searchHistory(query: string, limit = 100): CommandEntry[] {
  const entries = loadHistory();
  if (!query.trim()) return entries.slice(-limit).reverse();

  const q = query.toLowerCase();
  return entries
    .filter((e) => e.command.toLowerCase().includes(q))
    .reverse()
    .slice(0, limit);
}

/** 获取指定会话的历史记录 */
export function getSessionHistory(sessionId: string, limit = 50): CommandEntry[] {
  return loadHistory()
    .filter((e) => e.sessionId === sessionId)
    .reverse()
    .slice(0, limit);
}

/** 清除所有历史记录 */
export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
  } catch {
    // ignore
  }
}

// ========== 自定义命令相关函数 ==========
function loadCustomCommands(): CommandItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM);
    if (!raw) return [];
    return JSON.parse(raw) as CommandItem[];
  } catch {
    return [];
  }
}

function saveCustomCommands(commands: CommandItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(commands));
  } catch {
    // Storage full
  }
}

/** 获取所有自定义命令 */
export function getCustomCommands(): CommandItem[] {
  return loadCustomCommands();
}

/** 添加自定义命令 */
export function addCustomCommand(command: string, displayName?: string): CommandItem {
  const commands = loadCustomCommands();
  const newItem: CommandItem = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    command,
    displayName,
    source: 'custom',
    usageCount: 0,
    createdAt: Date.now(),
  };
  commands.push(newItem);
  saveCustomCommands(commands);
  return newItem;
}

/** 更新自定义命令 */
export function updateCustomCommand(id: string, updates: Partial<CommandItem>): boolean {
  const commands = loadCustomCommands();
  const idx = commands.findIndex(c => c.id === id);
  if (idx === -1) return false;
  
  commands[idx] = { ...commands[idx], ...updates };
  saveCustomCommands(commands);
  return true;
}

/** 删除自定义命令 */
export function deleteCustomCommand(id: string): boolean {
  const commands = loadCustomCommands();
  const filtered = commands.filter(c => c.id !== id);
  if (filtered.length === commands.length) return false;
  
  saveCustomCommands(filtered);
  return true;
}

/** 批量删除自定义命令 */
export function deleteCustomCommands(ids: string[]): void {
  const commands = loadCustomCommands();
  const filtered = commands.filter(c => !ids.includes(c.id));
  saveCustomCommands(filtered);
}

/** 增加命令使用次数 */
export function incrementCommandUsage(id: string): void {
  const commands = loadCustomCommands();
  const idx = commands.findIndex(c => c.id === id);
  if (idx !== -1) {
    commands[idx].usageCount++;
    commands[idx].lastUsedAt = Date.now();
    saveCustomCommands(commands);
  }
}

/** 清空所有自定义命令 */
export function clearCustomCommands(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_CUSTOM);
  } catch {
    // ignore
  }
}

// ========== 系统命令禁用状态 ==========
function loadSystemDisabled(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYSTEM_DISABLED);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSystemDisabled(disabled: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY_SYSTEM_DISABLED, JSON.stringify([...disabled]));
  } catch {
    // ignore
  }
}

/** 获取已禁用的系统命令ID列表 */
export function getDisabledSystemCommands(): Set<string> {
  return loadSystemDisabled();
}

/** 禁用/启用系统命令 */
export function toggleSystemCommandDisabled(id: string, disabled: boolean): void {
  const disabledSet = loadSystemDisabled();
  if (disabled) {
    disabledSet.add(id);
  } else {
    disabledSet.delete(id);
  }
  saveSystemDisabled(disabledSet);
}

/** 重置系统命令到默认状态（启用所有） */
export function resetSystemCommands(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SYSTEM_DISABLED);
  } catch {
    // ignore
  }
}

// ========== 统一命令列表（用于显示） ==========
export type SortOrder = 'time' | 'usage' | 'name';
export type FilterSource = 'all' | 'system' | 'custom' | 'history';

export interface CommandListOptions {
  source: FilterSource;
  query?: string;
  sortBy: SortOrder;
  sortOrder?: 'asc' | 'desc';
}

/** 获取统一的命令列表 */
export function getCommandList(options: CommandListOptions): CommandItem[] {
  const { source, query, sortBy, sortOrder = 'desc' } = options;
  const items: CommandItem[] = [];
  const queryLower = query?.toLowerCase().trim() || '';

  // 系统命令
  if (source === 'all' || source === 'system') {
    const disabledSet = loadSystemDisabled();
    SYSTEM_COMMANDS.forEach(sysCmd => {
      const isDisabled = disabledSet.has(sysCmd.id);
      // 搜索过滤
      if (queryLower && !sysCmd.command.toLowerCase().includes(queryLower)) {
        return;
      }
      items.push({
        id: sysCmd.id,
        command: sysCmd.command,
        source: 'system',
        usageCount: 0,
        createdAt: 0,
        disabled: isDisabled,
      });
    });
  }

  // 自定义命令
  if (source === 'all' || source === 'custom') {
    const customCmds = loadCustomCommands();
    customCmds.forEach(c => {
      // 搜索过滤
      if (queryLower && 
          !c.command.toLowerCase().includes(queryLower) && 
          !(c.displayName?.toLowerCase().includes(queryLower))) {
        return;
      }
      items.push({ ...c });
    });
  }

  // 历史记录
  if (source === 'all' || source === 'history') {
    const historyEntries = query ? searchHistory(query, 200) : loadHistory().slice(-200).reverse();
    const seenCmds = new Map<string, CommandItem>();
    
    historyEntries.forEach(entry => {
      const cmdKey = entry.command.toLowerCase();
      // 避免重复
      if (seenCmds.has(cmdKey)) {
        const existing = seenCmds.get(cmdKey)!;
        existing.usageCount++;
        if (!existing.lastUsedAt || entry.timestamp > existing.lastUsedAt) {
          existing.lastUsedAt = entry.timestamp;
        }
      } else {
        // 搜索过滤
        if (queryLower && !cmdKey.includes(queryLower)) {
          return;
        }
        const newItem: CommandItem = {
          id: `history-${entry.id}`,
          command: entry.command,
          source: 'history',
          usageCount: 1,
          lastUsedAt: entry.timestamp,
          createdAt: entry.timestamp,
        };
        seenCmds.set(cmdKey, newItem);
      }
    });

    seenCmds.forEach(item => items.push(item));
  }

  // 排序
  items.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'time':
        cmp = (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt);
        break;
      case 'usage':
        cmp = b.usageCount - a.usageCount;
        break;
      case 'name':
        cmp = a.command.localeCompare(b.command);
        break;
    }
    return sortOrder === 'desc' ? cmp : -cmp;
  });

  return items;
}

// ========== 从历史记录添加到自定义命令 ==========
export function addHistoryToCustom(historyId: string, command: string): CommandItem | null {
  // 检查是否已存在
  const customCmds = loadCustomCommands();
  if (customCmds.some(c => c.command === command)) {
    return null;
  }
  return addCustomCommand(command);
}

// ========== 迁移旧数据（如果有） ==========
export function migrateLegacyData(): void {
  try {
    // 检查是否有旧的 commonCommands 数据需要迁移
    const legacyKey = "zssh:common_commands_list";
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      const commands = JSON.parse(legacy) as Array<{ id: string; name: string; command: string }>;
      commands.forEach(c => {
        if (!loadCustomCommands().some(existing => existing.command === c.command)) {
          addCustomCommand(c.command, c.name);
        }
      });
      // 保留旧数据以便回滚
    }
  } catch {
    // ignore migration errors
  }
}
