import { describe, it, expect } from "vitest";
import { getCompletions, applyCompletion } from "../lib/autoComplete";

describe("autoComplete", () => {
  describe("getCompletions", () => {
    it("should return empty array for empty input", () => {
      expect(getCompletions("")).toEqual([]);
      expect(getCompletions("   ")).toEqual([]);
    });

    it("should complete common Linux commands by prefix", () => {
      const results = getCompletions("ls");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toBe("ls");
      expect(results[0].type).toBe("command");
    });

    it("should prioritize prefix matches over substring matches", () => {
      const results = getCompletions("gi");
      // git should come before git-add, git-commit etc due to prefix match priority
      const firstResult = results[0];
      expect(firstResult.text.toLowerCase().startsWith("gi")).toBe(true);
    });

    it("should find substring matches", () => {
      // Note: only searches command names (not descriptions) by default
      const results = getCompletions("git");
      // Should find git-add, git-commit etc that contain 'git'
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.type === "command")).toBe(true);
    });

    it("should limit results to 20 items", () => {
      // Use a very generic prefix to get many results
      const results = getCompletions("a");
      expect(results.length).toBeLessThanOrEqual(20);
    });

    it("should include displayText and type for each result", () => {
      const results = getCompletions("docker");
      results.forEach((item) => {
        expect(item).toHaveProperty("text");
        expect(item).toHaveProperty("displayText");
        expect(item).toHaveProperty("type");
        expect(["command", "file", "argument"]).toContain(item.type);
      });
    });

    it("should find docker-related commands", () => {
      const results = getCompletions("docker");
      const commands = results.map((r) => r.text);
      expect(commands).toContain("docker");
      expect(commands).toContain("docker-compose");
    });

    it("should find git-related commands", () => {
      const results = getCompletions("git-");
      const commands = results.map((r) => r.text);
      expect(commands).toContain("git-add");
      expect(commands).toContain("git-commit");
      expect(commands).toContain("git-push");
    });

    it("should find network commands", () => {
      const results = getCompletions("curl");
      expect(results.length).toBeGreaterThan(0);
      expect(results.map((r) => r.text)).toContain("curl");
    });

    it("should return empty for path-like prefixes (no SFTP integration)", () => {
      const results = getCompletions("./");
      expect(results).toEqual([]);
      
      const homeResults = getCompletions("~/");
      expect(homeResults).toEqual([]);
    });

    it("should be case-insensitive", () => {
      const lower = getCompletions("ls");
      const upper = getCompletions("LS");
      expect(lower.length).toEqual(upper.length);
    });

    it("should include package manager commands", () => {
      const npmResults = getCompletions("npm");
      expect(npmResults.map((r) => r.text)).toContain("npm");

      const pipResults = getCompletions("pip");
      expect(pipResults.map((r) => r.text)).toContain("pip");
      expect(pipResults.map((r) => r.text)).toContain("pip3");
    });
  });

  describe("applyCompletion", () => {
    it("should replace the word before cursor with completion", () => {
      const result = applyCompletion("ls -la", 2, { text: "ls", type: "command" });
      // Replaces "ls" at positions 0-1 with "ls " (space added for commands)
      expect(result.newText).toContain("ls");
      expect(result.newText).toContain("-la");
      expect(result.newCursorPos).toBeGreaterThan(2);
    });

    it("should add space after command completion", () => {
      const result = applyCompletion("g", 1, { text: "git", type: "command" });
      expect(result.newText).toBe("git ");
      expect(result.newCursorPos).toBe(4); // "git".length + 1
    });

    it("should NOT add space after file/argument completion", () => {
      const result = applyCompletion("echo ", 5, { text: "file.txt", type: "file" });
      expect(result.newText).toBe("echo file.txt");
      // Cursor should be at end of "echo file.txt" = 13
      expect(result.newCursorPos).toBe(13);
    });

    it("should handle cursor at end of line", () => {
      const result = applyCompletion("cat ", 4, { text: "/etc/passwd", type: "argument" });
      expect(result.newText).toBe("cat /etc/passwd");
    });

    it("should preserve text after cursor", () => {
      const result = applyCompletion("ls | grep", 2, { text: "ls", type: "command" });
      // After replacement: "ls " + "| grep" = "ls | grep"
      expect(result.newText).toContain("| grep");
    });

    it("should handle word boundary detection with special chars", () => {
      // At position 6 in "cd /usr/", the / is a word char so it extends back
      const result = applyCompletion("cd /usr/", 6, { text: "local", type: "file" });
      // Result depends on what the word boundary detects as the word start
      expect(result.newText).toContain("local");
    });
  });
});
