import { describe, it, expect } from "vitest";
import {
  replaceVariables,
  getSessionContext,
  getUnresolvedVariables,
  hasVariables,
  SUPPORTED_VARIABLES,
} from "../lib/variableReplacer";
import type { SessionPublic } from "../types";

describe("variableReplacer", () => {
  describe("replaceVariables", () => {
    it("should replace ${host}", () => {
      expect(replaceVariables("ssh ${host}", { host: "192.168.1.1" }))
        .toBe("ssh 192.168.1.1");
    });

    it("should replace ${user}", () => {
      expect(replaceVariables("${user}@host", { user: "admin" }))
        .toBe("admin@host");
    });

    it("should replace ${port}", () => {
      expect(replaceVariables("-p ${port}", { port: 2222 }))
        .toBe("-p 2222");
    });

    it("should replace ${name}", () => {
      expect(replaceVariables("echo '${name}'", { name: "prod-server" }))
        .toBe("echo 'prod-server'");
    });

    it("should replace ${date} with YYYY-MM-DD format", () => {
      const result = replaceVariables("log_${date}.txt", {});
      // Should look like log_2026-04-26.txt
      expect(result).toMatch(/^log_\d{4}-\d{2}-\d{2}\.txt$/);
    });

    it("should replace ${datetime} with ISO-like format", () => {
      const result = replaceVariables("backup_${datetime}", {});
      expect(result).toMatch(/^backup_\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it("should replace ${timestamp} with unix seconds", () => {
      const now = Math.floor(Date.now() / 1000);
      const result = replaceVariables("ts=${timestamp}", {});
      const extracted = parseInt(result.split("=")[1]!);
      expect(Math.abs(extracted - now)).toBeLessThanOrEqual(1);
    });

    it("should replace all occurrences of the same variable", () => {
      const result = replaceVariables(
        "scp ${user}@${host}:${path} ${user}@${host}:/backup/",
        { user: "root", host: "10.0.0.1" }
      );
      // All ${user} and ${host} replaced
      expect(result).not.toContain("${user}");
      expect(result).not.toContain("${host}");
      expect(result.match(/root/g)?.length).toBe(2);
      expect(result.match(/10\.0\.0\.1/g)?.length).toBe(2);
    });

    it("should use empty string for missing context values", () => {
      expect(replaceVariables("${host}:${port}", {}))
        .toBe(":22"); // port defaults to 22, host defaults to ""
    });

    it("should handle template with no variables", () => {
      expect(replaceVariables("ls -la", {})).toBe("ls -la");
      expect(replaceVariables("", {})).toBe("");
    });
  });

  describe("getSessionContext", () => {
    it("should extract context from session", () => {
      const session: SessionPublic = {
        id: "sess-1",
        name: "My Server",
        host: "example.com",
        port: 2222,
        username: "deploy",
        protocol: "ssh",
        authType: "password",
        hasPassword: false,
        hasKeyPassphrase: false,
        privateKeyPath: null,
        appearance: { theme: null, fontFamily: null, fontSize: null, lineHeight: null, encoding: "UTF-8" },
        connection: { connectTimeoutSeconds: null, keepAliveIntervalSeconds: null },
        groupId: null,
        favorite: false,
        sortIndex: 0,
        createdAt: 0,
        updatedAt: 0,
      };

      const ctx = getSessionContext(session);
      expect(ctx.host).toBe("example.com");
      expect(ctx.user).toBe("deploy");
      expect(ctx.port).toBe(2222);
      expect(ctx.name).toBe("My Server");
    });

    it("should generate name from host+username when name is empty", () => {
      const session: SessionPublic = {
        id: "sess-2",
        name: "",
        host: "192.168.1.100",
        port: 22,
        username: "root",
        protocol: "ssh",
        authType: "password",
        hasPassword: false,
        hasKeyPassphrase: false,
        privateKeyPath: null,
        appearance: { theme: null, fontFamily: null, fontSize: null, lineHeight: null, encoding: "UTF-8" },
        connection: { connectTimeoutSeconds: null, keepAliveIntervalSeconds: null },
        groupId: null,
        favorite: false,
        sortIndex: 0,
        createdAt: 0,
        updatedAt: 0,
      };

      const ctx = getSessionContext(session);
      expect(ctx.name).toBe("root@192.168.1.100");
    });
  });

  describe("getUnresolvedVariables", () => {
    it("should find unsupported variable names", () => {
      expect(getUnresolvedVariables("echo ${unknown_var}"))
        .toContain("unknown_var");
    });

    it("should not report supported variables", () => {
      const supportedVars = ["host", "user", "port", "name", "date", "datetime", "timestamp"];
      const tpl = supportedVars.map((v) => `${v}`).join(" ");
      expect(getUnresolvedVariables(`{${tpl}}`)).toEqual([]);
    });

    it("should return empty array for fully resolved templates", () => {
      expect(getUnresolvedVariables("ls -la ${date}")).toEqual([]);
    });
  });

  describe("hasVariables", () => {
    it("should detect ${...} patterns", () => {
      expect(hasVariables("ssh ${host}")).toBe(true);
      expect(hasVariables("${date}")).toBe(true);
    });

    it("should return false for plain strings", () => {
      expect(hasVariables("ls -la")).toBe(false);
      expect(hasVariables("")).toBe(false);
    });
  });

  describe("SUPPORTED_VARIABLES metadata", () => {
    it("should define all expected variables", () => {
      const keys = SUPPORTED_VARIABLES.map((v) => v.key);
      expect(keys).toContain("host");
      expect(keys).toContain("user");
      expect(keys).toContain("port");
      expect(keys).toContain("name");
      expect(keys).toContain("date");
      expect(keys).toContain("datetime");
      expect(keys).toContain("timestamp");
    });

    it("should have labels in all 3 languages", () => {
      SUPPORTED_VARIABLES.forEach((v) => {
        expect(v.label).toHaveProperty("zh-CN");
        expect(v.label).toHaveProperty("zh-TW");
        expect(v.label).toHaveProperty("en-US");
      });
    });
  });
});
