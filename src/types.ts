export type UUID = string;

export type Protocol = "ssh" | "telnet" | "rlogin";

export type AuthType = "password" | "key";

export interface Settings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  language: string;
  layoutMode: string;
  shortcuts: Record<string, string>;
  commonCommands: CommonCommand[];
}

export interface CommonCommand {
  id: string;
  name: string;
  command: string;
}

export interface Group {
  id: UUID;
  name: string;
  sortIndex: number;
}

export interface Appearance {
  theme: string | null;
  fontFamily: string | null;
  fontSize: number | null;
  lineHeight: number | null;
  encoding: string;
}

export interface ConnectionOptions {
  connectTimeoutSeconds: number | null;
  keepAliveIntervalSeconds: number | null;
}

export interface SessionPublic {
  id: UUID;
  name: string;
  host: string;
  port: number;
  username: string;
  protocol: Protocol;
  authType: AuthType;
  hasPassword: boolean;
  hasKeyPassphrase: boolean;
  privateKeyPath: string | null;
  appearance: Appearance;
  connection: ConnectionOptions;
  groupId: UUID | null;
  favorite: boolean;
  sortIndex: number;
  createdAt: number;
  updatedAt: number;
}

export type UpsertAuthInput =
  | { type: "password"; password?: string | null }
  | { type: "key"; privateKeyPath: string; passphrase?: string | null };

export interface UpsertSessionInput {
  id?: UUID | null;
  name: string;
  host: string;
  port: number;
  username: string;
  protocol: Protocol;
  auth: UpsertAuthInput;
  appearance?: Appearance | null;
  connection?: ConnectionOptions | null;
  groupId?: UUID | null;
  favorite: boolean;
  sortIndex?: number | null;
}

export interface UpsertGroupInput {
  id?: UUID | null;
  name: string;
  sortIndex?: number | null;
}

export interface PtyOutputEvent {
  ptyId: UUID;
  data: string;
}

export interface PtyExitEvent {
  ptyId: UUID;
  exitCode: number | null;
}

export interface HostKeyPromptEvent {
  ptyId: UUID;
  message: string;
}

export interface AuthPromptEvent {
  ptyId: UUID;
  kind: "password" | "keyPassphrase";
}

export interface PtyStartResult {
  ptyId: UUID;
}

export interface RemoteEntry {
  name: string;
  kind: string;
  size: number | null;
  raw: string;
}
