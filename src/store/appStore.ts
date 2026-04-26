import { create } from "zustand";
import type { Group, SessionPublic, Settings, UpsertAuthInput, UpsertGroupInput, UpsertSessionInput, UUID } from "../types";
import { api } from "../api";
import { dbg } from "../lib/debug";
import { DEFAULT_SHORTCUTS } from "../lib/defaultShortcuts";

export type TabKind = "ssh";

export interface Tab {
  id: UUID;
  sessionId: UUID;
  title: string;
  kind: TabKind;
  ptyId: UUID | null;
  sftpPtyId: UUID | null;
  split: boolean;
  splitDirection: "horizontal" | "vertical";
  inlineSession: UpsertSessionInput | null;
  temporary: boolean;
  sshCwdHint: string | null;
}

// ========================
// 辅助函数
// ========================

function newId(): UUID {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

/** 根据会话的 authType 构建认证输入（消除 4 处重复代码） */
function buildAuth(session: SessionPublic): UpsertAuthInput {
  return session.authType === "password"
    ? { type: "password", password: null }
    : { type: "key", privateKeyPath: session.privateKeyPath ?? "", passphrase: null };
}

/** 创建默认 Tab 对象 */
function createTab(overrides: Partial<Tab> & Pick<Tab, "sessionId" | "title">): Tab {
  return {
    id: newId(),
    kind: "ssh",
    ptyId: null,
    sftpPtyId: null,
    split: false,
    splitDirection: "horizontal",
    inlineSession: null,
    temporary: false,
    sshCwdHint: null,
    ...overrides,
  };
}

interface AppState {
  groups: Group[];
  sessions: SessionPublic[];
  settings: Settings | null;
  tabs: Tab[];
  activeTabId: UUID | null;
  hostKeyPrompt: { ptyId: UUID; message: string } | null;
  authPrompt: { ptyId: UUID; kind: "password" | "keyPassphrase" } | null;

  refreshAll(): Promise<void>;
  setActiveTab(id: UUID): void;
  closeTab(id: UUID): Promise<void>;
  reorderTabs(ids: UUID[]): void;

  upsertSession(s: Omit<import("../types").UpsertSessionInput, "id"> & { id?: UUID | null }): Promise<void>;
  deleteSession(id: UUID): Promise<void>;
  toggleFavorite(sessionId: UUID): Promise<void>;
  moveSessionToGroup(sessionId: UUID, targetGroupId: UUID | null, newSortIndex?: number): Promise<void>;
  reorderSessionsInGroup(groupId: UUID | null, sessionIds: UUID[]): Promise<void>;
  upsertGroup(input: UpsertGroupInput): Promise<void>;
  deleteGroup(groupId: UUID): Promise<void>;
  reorderGroups(ids: UUID[]): Promise<void>;

  openSessionTab(sessionId: UUID): Promise<void>;
  openTempTab(input: UpsertSessionInput): Promise<void>;
  duplicateTab(tabId: UUID, cols?: number, rows?: number): Promise<void>;
  connectTab(tabId: UUID, cols: number, rows: number): Promise<void>;
  disconnectTab(tabId: UUID): Promise<void>;
  openSftp(tabId: UUID, cols: number, rows: number): Promise<void>;
  closeSftp(tabId: UUID): Promise<void>;

  respondHostKey(accept: boolean): Promise<void>;
  provideAuth(value: string): Promise<void>;
  clearPrompts(): void;
}

export const useAppStore = create<AppState>((set, get) => ({
  groups: [],
  sessions: [],
  settings: null,
  tabs: [],
  activeTabId: null,
  hostKeyPrompt: null,
  authPrompt: null,

  async refreshAll() {
    dbg("info", "store.refreshAll:start");
    const [groups, sessions, settings] = await Promise.all([
      api.groupsList(),
      api.sessionsList(),
      api.settingsGet(),
    ]);
    set({
      groups,
      sessions,
      settings: {
        theme: settings.theme ?? "github-dark",
        fontFamily: settings.fontFamily ?? "Consolas",
        fontSize: settings.fontSize ?? 14,
        lineHeight: settings.lineHeight ?? 1.2,
        language: (settings as any).language ?? "zh-CN",
        layoutMode: (settings as any).layoutMode ?? "compact",
        shortcuts: { ...DEFAULT_SHORTCUTS, ...((settings as any).shortcuts ?? {}) },
        commonCommands: (settings as any).commonCommands ?? [],
      },
    });
    dbg("info", "store.refreshAll:done", { groups: groups.length, sessions: sessions.length });
  },

  setActiveTab(id) {
    dbg("info", "store.setActiveTab", { id });
    set({ activeTabId: id });
  },

  async closeTab(id) {
    dbg("info", "store.closeTab:start", { id });
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.ptyId) await api.ptyKill(tab.ptyId).catch(() => undefined);
    if (tab?.sftpPtyId) await api.ptyKill(tab.sftpPtyId).catch(() => undefined);
    const tabs = get().tabs.filter((t) => t.id !== id);
    const activeTabId = get().activeTabId === id ? (tabs[0]?.id ?? null) : get().activeTabId;
    set({ tabs, activeTabId });
    dbg("info", "store.closeTab:done", { id, tabs: tabs.length, activeTabId });
  },

  reorderTabs(ids) {
    dbg("debug", "store.reorderTabs", { ids });
    const byId = new Map(get().tabs.map((t) => [t.id, t]));
    const tabs = ids.map((id) => byId.get(id)).filter(Boolean) as Tab[];
    set({ tabs });
  },

  async upsertSession(input) {
    dbg("info", "store.upsertSession:start", { id: input.id ?? null, host: (input as any).host });
    await api.sessionUpsert({ ...input, id: input.id ?? null } as any);
    await get().refreshAll();
    dbg("info", "store.upsertSession:done");
  },

  async upsertGroup(input) {
    dbg("info", "store.upsertGroup:start", { id: input.id ?? null, name: input.name });
    await api.groupUpsert({ ...input, id: input.id ?? null } as any);
    await get().refreshAll();
    dbg("info", "store.upsertGroup:done");
  },

  async deleteGroup(groupId) {
    dbg("info", "store.deleteGroup:start", { groupId });
    await api.groupDelete(groupId);
    await get().refreshAll();
    dbg("info", "store.deleteGroup:done", { groupId });
  },

  async reorderGroups(ids) {
    dbg("info", "store.reorderGroups:start", { ids });
    const byId = new Map(get().groups.map((g) => [g.id, g]));
    for (let i = 0; i < ids.length; i++) {
      const g = byId.get(ids[i]);
      if (!g) continue;
      await api.groupUpsert({ id: g.id, name: g.name, sortIndex: i * 100 });
    }
    await get().refreshAll();
    dbg("info", "store.reorderGroups:done");
  },

  async deleteSession(id) {
    dbg("info", "store.deleteSession:start", { id });
    await api.sessionDelete(id);
    await get().refreshAll();
    dbg("info", "store.deleteSession:done", { id });
  },

  async toggleFavorite(sessionId) {
    dbg("info", "store.toggleFavorite:start", { sessionId });
    const s = get().sessions.find((x) => x.id === sessionId) ?? (await api.sessionGet(sessionId));
    if (!s) return;
    await api.sessionUpsert({
      id: s.id, name: s.name, host: s.host, port: s.port,
      username: s.username, protocol: s.protocol,
      auth: buildAuth(s), appearance: s.appearance,
      connection: s.connection, groupId: s.groupId,
      favorite: !s.favorite, sortIndex: s.sortIndex,
    });
    await get().refreshAll();
    dbg("info", "store.toggleFavorite:done", { sessionId, favorite: !s.favorite });
  },

  async moveSessionToGroup(sessionId: UUID, targetGroupId: UUID | null, newSortIndex?: number) {
    dbg("info", "store.moveSessionToGroup:start", { sessionId, targetGroupId });
    const s = get().sessions.find((x) => x.id === sessionId) ?? (await api.sessionGet(sessionId));
    if (!s) return;
    await api.sessionUpsert({
      id: s.id, name: s.name, host: s.host, port: s.port,
      username: s.username, protocol: s.protocol,
      auth: buildAuth(s), appearance: s.appearance,
      connection: s.connection, groupId: targetGroupId,
      favorite: s.favorite, sortIndex: newSortIndex ?? s.sortIndex,
    });
    await get().refreshAll();
    dbg("info", "store.moveSessionToGroup:done", { sessionId, targetGroupId });
  },

  async reorderSessionsInGroup(groupId: UUID | null, sessionIds: UUID[]) {
    dbg("info", "store.reorderSessionsInGroup:start", { groupId, count: sessionIds.length });
    for (let i = 0; i < sessionIds.length; i++) {
      const s = get().sessions.find((x) => x.id === sessionIds[i]);
      if (!s || s.groupId !== groupId) continue;
      await api.sessionUpsert({
        id: s.id, name: s.name, host: s.host, port: s.port,
        username: s.username, protocol: s.protocol,
        auth: buildAuth(s), appearance: s.appearance,
        connection: s.connection, groupId: s.groupId,
        favorite: s.favorite, sortIndex: i * 100,
      });
    }
    await get().refreshAll();
    dbg("info", "store.reorderSessionsInGroup:done");
  },

  async openSessionTab(sessionId) {
    dbg("info", "store.openSessionTab:start", { sessionId });
    const s = get().sessions.find((x) => x.id === sessionId) ?? (await api.sessionGet(sessionId));
    if (!s) return;
    const tab = createTab({ sessionId, title: s.name || `${s.username}@${s.host}` });
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id });
    dbg("info", "store.openSessionTab:done", { tabId: tab.id, sessionId });
  },

  async openTempTab(input) {
    dbg("info", "store.openTempTab:start", { host: input.host, username: input.username, protocol: input.protocol });
    const title = input.name?.trim() ? input.name.trim() : `${input.username}@${input.host}:${input.port}`;
    const tab = createTab({ sessionId: newId(), title, inlineSession: input, temporary: true });
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id });
    dbg("info", "store.openTempTab:done", { tabId: tab.id });
  },

  async duplicateTab(tabId, cols, rows) {
    const src = get().tabs.find((t) => t.id === tabId);
    if (!src) return;
    dbg("info", "store.duplicateTab:start", { tabId });
    const cwd = src.sshCwdHint ?? null;
    if (cwd && src.sshCwdHint !== cwd) {
      set({ tabs: get().tabs.map((t) => (t.id === src.id ? { ...t, sshCwdHint: cwd } : t)) });
    }
    const tab = createTab({
      sessionId: src.inlineSession ? newId() : src.sessionId,
      title: src.title,
      inlineSession: src.inlineSession ? { ...src.inlineSession } : null,
      temporary: src.temporary,
      sshCwdHint: cwd,
    });

    set({ tabs: [...get().tabs, tab], activeTabId: tab.id });
    dbg("info", "store.duplicateTab:done", { newTabId: tab.id, cwd: tab.sshCwdHint ?? null });

    if (typeof cols === "number" && typeof rows === "number") {
      await get().connectTab(tab.id, cols, rows);
    }
  },

  async connectTab(tabId, cols, rows) {
    dbg("info", "store.connectTab:start", { tabId, cols, rows });
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.ptyId) {
      dbg("debug", "store.connectTab:skip_already_connected", { tabId, ptyId: tab.ptyId });
      return;
    }
    const startDir = tab.sshCwdHint ?? null;
    const r = tab.inlineSession
      ? startDir
        ? await api.ptyStartSshInlineWithDir(tab.inlineSession, cols, rows, startDir)
        : await api.ptyStartSshInline(tab.inlineSession, cols, rows)
      : startDir
        ? await api.ptyStartSshWithDir(tab.sessionId, cols, rows, startDir)
        : await api.ptyStartSsh(tab.sessionId, cols, rows);
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, ptyId: r.ptyId } : t)),
    });
    dbg("info", "store.connectTab:done", { tabId, ptyId: r.ptyId });
  },

  async disconnectTab(tabId) {
    dbg("info", "store.disconnectTab:start", { tabId });
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.ptyId) await api.ptyKill(tab.ptyId).catch(() => undefined);
    if (tab.sftpPtyId) await api.ptyKill(tab.sftpPtyId).catch(() => undefined);
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, ptyId: null, sftpPtyId: null } : t)),
    });
    dbg("info", "store.disconnectTab:done", { tabId });
  },

  async openSftp(tabId, cols, rows) {
    dbg("info", "store.openSftp:start", { tabId, cols, rows });
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.sftpPtyId) {
      dbg("debug", "store.openSftp:skip_already_open", { tabId, ptyId: tab.sftpPtyId });
      return;
    }
    const startDir = tab.sshCwdHint ?? null;
    if (startDir && tab.sshCwdHint !== startDir) {
      set({ tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, sshCwdHint: startDir } : t)) });
    }
    const r = tab.inlineSession
      ? startDir
        ? await api.ptyStartSftpInlineWithDir(tab.inlineSession, cols, rows, startDir)
        : await api.ptyStartSftpInline(tab.inlineSession, cols, rows)
      : startDir
        ? await api.ptyStartSftpWithDir(tab.sessionId, cols, rows, startDir)
        : await api.ptyStartSftp(tab.sessionId, cols, rows);
    set({
      tabs: get().tabs.map((t) =>
        t.id === tabId ? { ...t, sftpPtyId: r.ptyId, split: true, splitDirection: t.splitDirection ?? "horizontal" } : t,
      ),
    });
    if (startDir) {
      api
        .sftpWaitReady(r.ptyId, 30_000)
        .then(() => api.sftpCd(r.ptyId, startDir!))
        .catch(() => undefined);
    }
    dbg("info", "store.openSftp:done", { tabId, ptyId: r.ptyId });
  },

  async closeSftp(tabId) {
    dbg("info", "store.closeSftp:start", { tabId });
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.sftpPtyId) await api.ptyKill(tab.sftpPtyId).catch(() => undefined);
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, sftpPtyId: null, split: false } : t)),
    });
    dbg("info", "store.closeSftp:done", { tabId });
  },

  async respondHostKey(accept) {
    const prompt = get().hostKeyPrompt;
    if (!prompt) return;
    dbg("info", "store.respondHostKey", { ptyId: prompt.ptyId, accept });
    await api.ptyRespondHostKey(prompt.ptyId, accept);
    set({ hostKeyPrompt: null });
  },

  async provideAuth(value) {
    const prompt = get().authPrompt;
    if (!prompt) return;
    dbg("info", "store.provideAuth", { ptyId: prompt.ptyId, kind: prompt.kind, len: value.length });
    await api.ptyProvideAuth(prompt.ptyId, value);
    set({ authPrompt: null });
  },

  clearPrompts() {
    dbg("debug", "store.clearPrompts");
    set({ hostKeyPrompt: null, authPrompt: null });
  },
}));
