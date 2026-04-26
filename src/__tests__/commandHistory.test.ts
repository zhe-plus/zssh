import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { addCommand, searchHistory, getSessionHistory, clearHistory } from "../lib/commandHistory";

describe("commandHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("addCommand", () => {
    it("should add a command entry", () => {
      addCommand("session-1", "ls -la");
      const history = searchHistory("");
      expect(history).toHaveLength(1);
      expect(history[0].command).toBe("ls -la");
      expect(history[0].sessionId).toBe("session-1");
    });

    it("should reject whitespace-only commands", () => {
      addCommand("session-1", "   ");
      addCommand("session-1", "");
      addCommand("session-1", "\t");
      expect(searchHistory("")).toHaveLength(0);
    });

    it("should trim command whitespace", () => {
      addCommand("session-1", "  ls -la  ");
      const history = searchHistory("");
      expect(history[0].command).toBe("ls -la");
    });

    it("should deduplicate consecutive identical commands in same session", () => {
      addCommand("session-1", "pwd");
      addCommand("session-1", "pwd"); // consecutive duplicate -> deduplicated
      const history = searchHistory("");
      const pwdEntries = history.filter((e) => e.command === "pwd");
      expect(pwdEntries).toHaveLength(1);
    });

    it("should allow same command in different sessions", () => {
      addCommand("session-1", "pwd");
      addCommand("session-2", "pwd");
      const history = searchHistory("");
      const pwdEntries = history.filter((e) => e.command === "pwd");
      expect(pwdEntries).toHaveLength(2);
    });

    it("should assign unique IDs", () => {
      addCommand("session-1", "cmd1");
      addCommand("session-1", "cmd2");
      const history = searchHistory("");
      expect(history[0].id).not.toBe(history[1].id);
    });

    it("should record timestamps", () => {
      const before = Date.now();
      addCommand("session-1", "test");
      const after = Date.now();
      const entry = searchHistory("")[0];
      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("searchHistory", () => {
    beforeEach(() => {
      addCommand("s1", "ls -la /home");
      addCommand("s1", "cd /home/user");
      addCommand("s2", "ls -la /var/log");
      addCommand("s1", "grep -r pattern /src");
      addCommand("s2", "tail -f /var/log/syslog");
    });

    it("should return all history when query is empty", () => {
      const results = searchHistory("");
      expect(results.length).toBe(5);
    });

    it("should filter by substring (case-insensitive)", () => {
      const results = searchHistory("LS");
      expect(results.length).toBe(2); // ls -la entries
    });

    it("should filter by partial command match", () => {
      const results = searchHistory("log");
      expect(results.length).toBe(2); // ls -la /var/log, tail -f syslog
    });

    it("should return results in reverse chronological order (newest first)", () => {
      const results = searchHistory("");
      for (let i = 1; i < results.length; i++) {
        // Allow 1ms tolerance for timing variations
        expect(results[i - 1].timestamp).toBeGreaterThanOrEqual(results[i].timestamp - 1);
      }
    });

    it("should respect limit parameter", () => {
      const results = searchHistory("", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should return empty for non-matching query", () => {
      const results = searchHistory("zzz_nonexistent_zzz");
      expect(results).toHaveLength(0);
    });
  });

  describe("getSessionHistory", () => {
    beforeEach(() => {
      addCommand("s1", "cmd-a");
      addCommand("s1", "cmd-b");
      addCommand("s2", "cmd-c");
      addCommand("s1", "cmd-d");
    });

    it("should return only commands for specified session", () => {
      const s1History = getSessionHistory("s1");
      expect(s1History).toHaveLength(3);
      s1History.forEach((entry) => {
        expect(entry.sessionId).toBe("s1");
      });
    });

    it("should return newest-first for session history", () => {
      const s1History = getSessionHistory("s1");
      expect(s1History[0].command).toBe("cmd-d"); // most recent
      expect(s1History[s1History.length - 1].command).toBe("cmd-a"); // oldest
    });

    it("should respect limit", () => {
      const limited = getSessionHistory("s1", 2);
      expect(limited).toHaveLength(2);
    });

    it("should return empty for session with no history", () => {
      expect(getSessionHistory("nonexistent")).toHaveLength(0);
    });
  });

  describe("clearHistory", () => {
    it("should clear all stored history", () => {
      addCommand("s1", "data");
      expect(searchHistory("")).toHaveLength(1);

      clearHistory();
      expect(searchHistory("")).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    it("should persist across clear-and-re-add cycles", () => {
      addCommand("s1", "persistent");
      expect(searchHistory("persistent")).toHaveLength(1);
      
      clearHistory();
      expect(searchHistory("")).toHaveLength(0);
      
      addCommand("s1", "new-data");
      expect(searchHistory("new-data")).toHaveLength(1);
    });
  });
});
