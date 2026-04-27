export interface CompletionItem {
  text: string;
  displayText?: string;
  description?: string;
  type: "command" | "file" | "argument";
}

const COMMON_COMMANDS: string[] = [
  // File operations
  "ls", "cd", "pwd", "mkdir", "rmdir", "rm", "cp", "mv", "touch",
  "cat", "less", "more", "head", "tail", "grep", "find", "locate",
  "chmod", "chown", "chgrp", "ln", "tar", "gzip", "gunzip", "zip", "unzip",

  // System info & management
  "uname", "hostname", "whoami", "id", "date", "uptime", "w", "top",
  "ps", "kill", "killall", "bg", "fg", "jobs", "nohup",
  "df", "du", "free", "vmstat", "iostat",

  // Network
  "ssh", "scp", "sftp", "rsync", "curl", "wget", "ping", "traceroute",
  "netstat", "ss", "nslookup", "dig", "ifconfig", "ip",

  // Package managers
  "apt", "apt-get", "dpkg", "yum", "dnf", "rpm", "pacman",
  "pip", "pip3", "npm", "yarn", "pnpm", "cargo", "go", "composer",

  // Git
  "git", "git-add", "git-commit", "git-push", "git-pull",
  "git-branch", "git-checkout", "git-merge", "git-status",
  "git-diff", "git-log", "git-stash", "git-clone",

  // Docker
  "docker", "docker-compose", "docker-build", "docker-run",
  "docker-ps", "docker-images", "docker-exec",

  // Editors
  "vim", "vi", "nano", "emacs", "code",

  // Process monitoring
  "htop", "iotop", "nethogs", "lsof", "strace",

  // Misc
  "echo", "printf", "env", "export", "alias", "history",
  "clear", "reset", "exit", "sudo", "su", "screen", "tmux",
  "awk", "sed", "sort", "uniq", "wc", "tr", "cut", "tee",
  "xargs", "watch", "time", "which", "whereis", "type", "man",
  "journalctl", "systemctl", "service",
];

/**
 * Get auto-completion candidates for the given input prefix.
 * @param prefix The text before cursor (e.g., "gi" or "./")
 * @returns Array of matching completion items, sorted by relevance
 */
export function getCompletions(prefix: string): CompletionItem[] {
  if (!prefix || prefix.trim().length === 0) return [];

  const trimmed = prefix.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  // If prefix looks like a path (contains / or . or ~)
  if (trimmed.includes("/") || trimmed.startsWith(".") || trimmed.startsWith("~")) {
    return getPathCompletions(trimmed);
  }

  // Command completion
  const results: CompletionItem[] = [];
  for (const cmd of COMMON_COMMANDS) {
    const lowerCmd = cmd.toLowerCase();
    if (lowerCmd.startsWith(lowerTrimmed) || lowerCmd.includes(lowerTrimmed)) {
      results.push({
        text: cmd,
        displayText: cmd,
        type: "command",
        description: getCommandDescription(cmd),
      });
    }
  }

  // Sort: prefix matches first, then substring matches
  results.sort((a, b) => {
    const aLower = a.text.toLowerCase();
    const bLower = b.text.toLowerCase();
    const aStarts = aLower.startsWith(lowerTrimmed) ? 0 : 1;
    const bStarts = bLower.startsWith(lowerTrimmed) ? 0 : 1;
    return aStarts - bStarts || a.text.localeCompare(b.text);
  });

  // Limit to 20 results for performance
  return results.slice(0, 20);
}

/**
 * For path completions, we'd need SFTP/SSH integration.
 * This returns a placeholder that indicates file completions are needed.
 */
function getPathCompletions(_prefix: string): CompletionItem[] {
  // In production, this would call the SFTP API to list directory contents
  // For now, we return empty and let the shell handle it natively
  return [];
}

/**
 * Get short description for common commands
 */
function getCommandDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
    ls: "List directory contents",
    cd: "Change directory",
    pwd: "Print working directory",
    cat: "Concatenate/display files",
    grep: "Search text patterns",
    find: "Search for files",
    ssh: "Secure Shell connection",
    scp: "Secure copy (remote file transfer)",
    git: "Distributed version control",
    docker: "Container platform CLI",
    npm: "Node.js package manager",
    pip: "Python package manager",
    sudo: "Execute as superuser",
    systemctl: "System service manager",
    journalctl: "Query systemd logs",
    top: "Process viewer",
    htop: "Interactive process viewer",
    vim: "Text editor",
    nano: "Simple text editor",
    tar: "Archive utility",
    curl: "Transfer data from URL",
    wget: "Network downloader",
    ping: "Network connectivity test",
  };
  return descriptions[cmd] ?? "";
}

/**
 * Apply completion: insert the completed text at the current position.
 */
export function applyCompletion(
  originalLine: string,
  cursorPos: number,
  candidate: CompletionItem,
): { newText: string; newCursorPos: number } {
  // Find the word start position from cursor
  let wordStart = cursorPos;
  while (wordStart > 0 && /[\w\-./~]/.test(originalLine[wordStart - 1])) {
    wordStart--;
  }

  const before = originalLine.substring(0, wordStart);
  const after = originalLine.substring(cursorPos);

  // Add space after command completion
  const suffix = candidate.type === "command" ? " " : "";
  return {
    newText: before + candidate.text + suffix + after,
    newCursorPos: wordStart + candidate.text.length + suffix.length,
  };
}
