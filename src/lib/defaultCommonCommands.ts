import type { CommonCommand } from "../types";
import { t } from "./i18n";

const BASE: Array<Pick<CommonCommand, "id" | "command">> = [
  { id: "pwd", command: "pwd" },
  { id: "ls-la", command: "ls -la" },
  { id: "whoami", command: "whoami" },
  { id: "uname-a", command: "uname -a" },
  { id: "df-h", command: "df -h" },
  { id: "free-h", command: "free -h" },
  { id: "ps-head", command: "ps aux | head" },
  { id: "ip-a", command: "ip a" },
  { id: "clear", command: "clear" },
];

export function getDefaultCommonCommands(lang: string | null | undefined): CommonCommand[] {
  const nameKey: Record<string, Parameters<typeof t>[1]> = {
    pwd: "commonCmdPwd",
    "ls-la": "commonCmdLsLa",
    whoami: "commonCmdWhoami",
    "uname-a": "commonCmdUnameA",
    "df-h": "commonCmdDfH",
    "free-h": "commonCmdFreeH",
    "ps-head": "commonCmdPsHead",
    "ip-a": "commonCmdIpA",
    clear: "commonCmdClear",
  };
  return BASE.map((c) => ({ ...c, name: t(lang, nameKey[c.id] ?? "commonCommands") }));
}

export const DEFAULT_COMMON_COMMANDS: CommonCommand[] = getDefaultCommonCommands("zh-CN");
