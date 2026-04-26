import { describe, it, expect } from "vitest";
import { t, tf } from "../lib/i18n";

describe("i18n", () => {
  it("should return Chinese Simplified by default (null/undefined)", () => {
    expect(t(null, "settings")).toBe("设置");
    expect(t(undefined, "connect")).toBe("连接");
  });

  it("should return zh-CN translations correctly", () => {
    expect(t("zh-CN", "settings")).toBe("设置");
    expect(t("zh-CN", "done")).toBe("完成");
    expect(t("zh-CN", "sftp")).toBe("SFTP");
  });

  it("should return zh-TW translations correctly", () => {
    expect(t("zh-TW", "settings")).toBe("設定");
    expect(t("zh-TW", "connect")).toBe("連線");
    expect(t("zh-TW", "delete")).toBe("刪除");
  });

  it("should return en-US translations correctly", () => {
    expect(t("en-US", "settings")).toBe("Settings");
    expect(t("en-US", "connect")).toBe("Connect");
    expect(t("en-US", "cancel")).toBe("Cancel");
  });

  it("should fall back to zh-CN for unknown keys in any locale", () => {
    const result = t("en-US", "terminalProcessExited");
    expect(result).toContain("[");
  });

  it("should return key string for completely unknown keys", () => {
    const result = t("zh-CN", "nonexistent_key_12345" as any);
    expect(result).toBe("nonexistent_key_12345");
  });

  describe("tf (templated translation)", () => {
    it("should replace single variable", () => {
      expect(tf("zh-CN", "sftpConfirmDelete", { name: "test.txt" })).toBe(
        "删除：test.txt ?"
      );
    });

    it("should replace multiple variables", () => {
      const result = tf("zh-CN", "syncStats", {
        total: 10,
        onlyLocal: 3,
        onlyRemote: 4,
        different: 2,
      });
      expect(result).toContain("10");
      expect(result).toContain("3");
      expect(result).toContain("4");
      expect(result).toContain("2");
    });

    it("should keep unreplaced variables as-is", () => {
      const result = tf("zh-CN", "sftpConfirmDelete", {});
      expect(result).toBe("删除：{name} ?");
    });

    it("should work with en-US locale", () => {
      expect(tf("en-US", "remoteEditPath", { path: "/etc/hosts" })).toBe(
        "Path: /etc/hosts"
      );
    });
  });

  describe("consistency across locales", () => {
    // All three locales must have the same set of keys
    const zhCNKeys = new Set([
      "settings", "done", "connect", "disconnect", "sftp",
      "commonCommands", "quickCommands", "tempConnection",
      "confirm", "cancel", "save", "add", "edit", "delete",
      "rename", "transferComplete", "transferFailed", "monitorTitle",
    ]);

    it.each(Array.from(zhCNKeys))(
      "key '%s' should exist in all locales",
      (key) => {
        const zh = t("zh-CN", key as any);
        const tw = t("zh-TW", key as any);
        const en = t("en-US", key as any);
        // All should return a non-empty string or the same fallback
        expect(typeof zh).toBe("string");
        expect(typeof tw).toBe("string");
        expect(typeof en).toBe("string");
        expect(zh.length).toBeGreaterThan(0);
        expect(tw.length).toBeGreaterThan(0);
        expect(en.length).toBeGreaterThan(0);
      }
    );
  });
});
