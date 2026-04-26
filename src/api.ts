import { invoke } from "@tauri-apps/api/core";
import type {
  Group,
  PtyStartResult,
  RemoteEntry,
  SessionPublic,
  Settings,
  UpsertGroupInput,
  UpsertSessionInput,
  UUID,
} from "./types";
import { dbg, safeStr } from "./lib/debug";

export const api = {
  groupsList(): Promise<Group[]> {
    dbg("debug", "invoke groups_list:start");
    const t0 = performance.now();
    return invoke<Group[]>("groups_list").finally(() => dbg("debug", "invoke groups_list:done", { ms: Math.round(performance.now() - t0) }));
  },
  groupUpsert(input: UpsertGroupInput): Promise<Group> {
    dbg("debug", "invoke group_upsert:start", { id: input.id ?? null, name: input.name });
    const t0 = performance.now();
    return invoke<Group>("group_upsert", { input }).finally(() => dbg("debug", "invoke group_upsert:done", { ms: Math.round(performance.now() - t0) }));
  },
  groupDelete(groupId: UUID): Promise<void> {
    dbg("debug", "invoke group_delete:start", { groupId });
    const t0 = performance.now();
    return invoke<void>("group_delete", { groupId }).finally(() => dbg("debug", "invoke group_delete:done", { ms: Math.round(performance.now() - t0) }));
  },

  sessionsList(): Promise<SessionPublic[]> {
    dbg("debug", "invoke sessions_list:start");
    const t0 = performance.now();
    return invoke<SessionPublic[]>("sessions_list").finally(() => dbg("debug", "invoke sessions_list:done", { ms: Math.round(performance.now() - t0) }));
  },
  sessionGet(sessionId: UUID): Promise<SessionPublic | null> {
    dbg("debug", "invoke session_get:start", { sessionId });
    const t0 = performance.now();
    return invoke<SessionPublic | null>("session_get", { sessionId }).finally(() => dbg("debug", "invoke session_get:done", { ms: Math.round(performance.now() - t0) }));
  },
  sessionUpsert(input: UpsertSessionInput): Promise<SessionPublic> {
    dbg("debug", "invoke session_upsert:start", { id: input.id ?? null, host: input.host, username: input.username, protocol: input.protocol });
    const t0 = performance.now();
    return invoke<SessionPublic>("session_upsert", { input }).finally(() => dbg("debug", "invoke session_upsert:done", { ms: Math.round(performance.now() - t0) }));
  },
  sessionDelete(sessionId: UUID): Promise<void> {
    dbg("debug", "invoke session_delete:start", { sessionId });
    const t0 = performance.now();
    return invoke<void>("session_delete", { sessionId }).finally(() => dbg("debug", "invoke session_delete:done", { ms: Math.round(performance.now() - t0) }));
  },

  settingsGet(): Promise<Settings> {
    dbg("debug", "invoke settings_get:start");
    const t0 = performance.now();
    return invoke<Settings>("settings_get").finally(() => dbg("debug", "invoke settings_get:done", { ms: Math.round(performance.now() - t0) }));
  },
  settingsSet(settings: Settings): Promise<void> {
    dbg("debug", "invoke settings_set:start", { theme: settings.theme, fontFamily: settings.fontFamily, fontSize: settings.fontSize, lineHeight: settings.lineHeight });
    const t0 = performance.now();
    return invoke<void>("settings_set", { settings }).finally(() => dbg("debug", "invoke settings_set:done", { ms: Math.round(performance.now() - t0) }));
  },

  configExport(includeSensitive: boolean): Promise<string> {
    dbg("debug", "invoke config_export_cmd:start", { includeSensitive });
    const t0 = performance.now();
    return invoke<string>("config_export_cmd", { includeSensitive }).finally(() => dbg("debug", "invoke config_export_cmd:done", { ms: Math.round(performance.now() - t0) }));
  },
  configExportToPath(includeSensitive: boolean, path: string): Promise<void> {
    dbg("debug", "invoke config_export_to_path_cmd:start", { includeSensitive, path });
    const t0 = performance.now();
    return invoke<void>("config_export_to_path_cmd", { includeSensitive, path }).finally(() =>
      dbg("debug", "invoke config_export_to_path_cmd:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  configImportFromPath(path: string, mode: "merge" | "replace"): Promise<void> {
    dbg("debug", "invoke config_import_from_path_cmd:start", { path, mode });
    const t0 = performance.now();
    return invoke<void>("config_import_from_path_cmd", { path, mode }).finally(() =>
      dbg("debug", "invoke config_import_from_path_cmd:done", { ms: Math.round(performance.now() - t0) }),
    );
  },

  ptyStartSsh(sessionId: UUID, cols: number, rows: number): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_ssh:start", { sessionId, cols, rows });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_ssh", { sessionId, cols, rows, startDir: null }).finally(() =>
      dbg("info", "invoke pty_start_ssh:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptyStartSshWithDir(sessionId: UUID, cols: number, rows: number, startDir: string): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_ssh:start", { sessionId, cols, rows, startDir });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_ssh", { sessionId, cols, rows, startDir }).finally(() =>
      dbg("info", "invoke pty_start_ssh:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptyStartSshInline(session: UpsertSessionInput, cols: number, rows: number): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_ssh_inline:start", { host: session.host, username: session.username, protocol: session.protocol, cols, rows });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_ssh_inline", { session, cols, rows, startDir: null }).finally(() =>
      dbg("info", "invoke pty_start_ssh_inline:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptyStartSshInlineWithDir(session: UpsertSessionInput, cols: number, rows: number, startDir: string): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_ssh_inline:start", { host: session.host, username: session.username, protocol: session.protocol, cols, rows, startDir });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_ssh_inline", { session, cols, rows, startDir }).finally(() =>
      dbg("info", "invoke pty_start_ssh_inline:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptyStartSftp(sessionId: UUID, cols: number, rows: number): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_sftp:start", { sessionId, cols, rows });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_sftp", { sessionId, cols, rows, startDir: null }).finally(() =>
      dbg("info", "invoke pty_start_sftp:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptyStartSftpWithDir(sessionId: UUID, cols: number, rows: number, startDir: string): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_sftp:start", { sessionId, cols, rows, startDir });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_sftp", { sessionId, cols, rows, startDir }).finally(() =>
      dbg("info", "invoke pty_start_sftp:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptyStartSftpInline(session: UpsertSessionInput, cols: number, rows: number): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_sftp_inline:start", { host: session.host, username: session.username, protocol: session.protocol, cols, rows });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_sftp_inline", { session, cols, rows, startDir: null }).finally(() =>
      dbg("info", "invoke pty_start_sftp_inline:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptyStartSftpInlineWithDir(session: UpsertSessionInput, cols: number, rows: number, startDir: string): Promise<PtyStartResult> {
    dbg("info", "invoke pty_start_sftp_inline:start", { host: session.host, username: session.username, protocol: session.protocol, cols, rows, startDir });
    const t0 = performance.now();
    return invoke<PtyStartResult>("pty_start_sftp_inline", { session, cols, rows, startDir }).finally(() =>
      dbg("info", "invoke pty_start_sftp_inline:done", { ms: Math.round(performance.now() - t0) }),
    );
  },
  ptySend(ptyId: UUID, data: string): Promise<void> {
    dbg("debug", "invoke pty_send", { ptyId, len: data.length, preview: safeStr(data, 32) });
    return invoke<void>("pty_send", { ptyId, data });
  },
  ptyResize(ptyId: UUID, cols: number, rows: number): Promise<void> {
    dbg("debug", "invoke pty_resize_cmd", { ptyId, cols, rows });
    return invoke<void>("pty_resize_cmd", { ptyId, cols, rows });
  },
  ptyKill(ptyId: UUID): Promise<void> {
    dbg("info", "invoke pty_kill_cmd", { ptyId });
    return invoke<void>("pty_kill_cmd", { ptyId });
  },
  ptyRespondHostKey(ptyId: UUID, accept: boolean): Promise<void> {
    dbg("info", "invoke pty_respond_hostkey", { ptyId, accept });
    return invoke<void>("pty_respond_hostkey", { ptyId, accept });
  },
  ptyProvideAuth(ptyId: UUID, value: string): Promise<void> {
    dbg("info", "invoke pty_provide_auth", { ptyId, len: value.length });
    return invoke<void>("pty_provide_auth", { ptyId, value });
  },

  sshPwd(ptyId: UUID): Promise<string> {
    dbg("debug", "invoke ssh_pwd_cmd:start", { ptyId });
    const t0 = performance.now();
    return invoke<string>("ssh_pwd_cmd", { ptyId })
      .catch((e) => {
        dbg("error", "invoke ssh_pwd_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("debug", "invoke ssh_pwd_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },

  sftpWaitReady(ptyId: UUID, timeoutMs?: number | null): Promise<void> {
    dbg("debug", "invoke sftp_wait_ready_cmd:start", { ptyId, timeoutMs: timeoutMs ?? null });
    const t0 = performance.now();
    return invoke<void>("sftp_wait_ready_cmd", { ptyId, timeoutMs: timeoutMs ?? null }).finally(() =>
      dbg("debug", "invoke sftp_wait_ready_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }),
    );
  },

  sftpPwd(ptyId: UUID): Promise<string> {
    dbg("debug", "invoke sftp_pwd_cmd:start", { ptyId });
    const t0 = performance.now();
    return invoke<string>("sftp_pwd_cmd", { ptyId })
      .catch((e) => {
        dbg("error", "invoke sftp_pwd_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("debug", "invoke sftp_pwd_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
  sftpLs(ptyId: UUID, path?: string | null): Promise<RemoteEntry[]> {
    dbg("debug", "invoke sftp_ls_cmd:start", { ptyId, path: path ?? null });
    const t0 = performance.now();
    return invoke<RemoteEntry[]>("sftp_ls_cmd", { ptyId, path: path ?? null })
      .catch((e) => {
        dbg("error", "invoke sftp_ls_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("debug", "invoke sftp_ls_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
  sftpCd(ptyId: UUID, path: string): Promise<void> {
    dbg("debug", "invoke sftp_cd_cmd:start", { ptyId, path });
    const t0 = performance.now();
    return invoke<void>("sftp_cd_cmd", { ptyId, path })
      .catch((e) => {
        dbg("error", "invoke sftp_cd_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("debug", "invoke sftp_cd_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
  sftpMkdir(ptyId: UUID, path: string): Promise<void> {
    dbg("debug", "invoke sftp_mkdir_cmd:start", { ptyId, path });
    const t0 = performance.now();
    return invoke<void>("sftp_mkdir_cmd", { ptyId, path })
      .catch((e) => {
        dbg("error", "invoke sftp_mkdir_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("debug", "invoke sftp_mkdir_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
  sftpRm(ptyId: UUID, path: string, recursive: boolean): Promise<void> {
    dbg("debug", "invoke sftp_rm_cmd:start", { ptyId, path, recursive });
    const t0 = performance.now();
    return invoke<void>("sftp_rm_cmd", { ptyId, path, recursive })
      .catch((e) => {
        dbg("error", "invoke sftp_rm_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("debug", "invoke sftp_rm_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
  sftpRename(ptyId: UUID, from: string, to: string): Promise<void> {
    dbg("debug", "invoke sftp_rename_cmd:start", { ptyId, from, to });
    const t0 = performance.now();
    return invoke<void>("sftp_rename_cmd", { ptyId, from, to })
      .catch((e) => {
        dbg("error", "invoke sftp_rename_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("debug", "invoke sftp_rename_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
  sftpGet(ptyId: UUID, remote: string, local: string): Promise<void> {
    dbg("info", "invoke sftp_get_cmd:start", { ptyId, remote, local });
    const t0 = performance.now();
    return invoke<void>("sftp_get_cmd", { ptyId, remote, local })
      .catch((e) => {
        dbg("error", "invoke sftp_get_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("info", "invoke sftp_get_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
  sftpPut(ptyId: UUID, local: string, remote: string): Promise<void> {
    dbg("info", "invoke sftp_put_cmd:start", { ptyId, local, remote });
    const t0 = performance.now();
    return invoke<void>("sftp_put_cmd", { ptyId, local, remote })
      .catch((e) => {
        dbg("error", "invoke sftp_put_cmd:error", { ptyId, message: String((e as any)?.message ?? e) });
        throw e;
      })
      .finally(() => dbg("info", "invoke sftp_put_cmd:done", { ptyId, ms: Math.round(performance.now() - t0) }));
  },
};
