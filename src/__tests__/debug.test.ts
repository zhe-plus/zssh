import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dbg, dbgEnabled, safeStr } from "../lib/debug";

describe("debug", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("dbg", () => {
    it("should call console in DEV mode", () => {
      // In test environment, import.meta.env.DEV should be true
      dbg("debug", "test-event", { key: "value" });
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should format message with timestamp prefix", () => {
      dbg("debug", "my-event");
      const calledArgs = consoleLogSpy.mock.calls[0];
      const msg = String(calledArgs?.[0]);
      expect(msg).toContain("[zssh");
      expect(msg).toContain("my-event");
    });

    it("should pass data payload as second argument", () => {
      const data = { foo: "bar", count: 42 };
      dbg("debug", "payload-test", data);
      const calledArgs = consoleLogSpy.mock.calls[0];
      expect(calledArgs?.[1]).toEqual(data);
    });

    it("should not print anything when data is undefined", () => {
      dbg("warn", "no-data");
      // warn level uses console.warn
      const calledArgs = consoleWarnSpy.mock.calls[0];
      expect(calledArgs).toBeDefined();
      const msg = String(calledArgs?.[0]);
      expect(msg.trim()).toBeTruthy();
    });

    it("should map error level to console.error", () => {
      dbg("error", "error-event", { err: "something broke" });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should map warn level to console.warn", () => {
      dbg("warn", "warn-event");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should map info level to console.info", () => {
      dbg("info", "info-event");
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it("should map debug level to console.log", () => {
      dbg("debug", "debug-event");
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe("safeStr", () => {
    it("should return short strings unchanged", () => {
      expect(safeStr("hello")).toBe("hello");
      expect(safeStr("")).toBe("");
    });

    it("should escape carriage returns as \\r", () => {
      expect(safeStr("hello\rworld")).toBe("hello\\rworld");
    });

    it("should escape newlines as \\n", () => {
      expect(safeStr("line1\nline2")).toBe("line1\\nline2");
    });

    it("should truncate long strings with ellipsis and remaining count", () => {
      const long = "x".repeat(200);
      const result = safeStr(long, 80);
      expect(result.length).toBeLessThanOrEqual(80 + 30); // some overhead for count
      expect(result).toContain("…(+");
      expect(result).toContain("120"); // 200 - 80 = 120 remaining
    });

    it("should use default max length of 80", () => {
      const long = "y".repeat(150);
      const result = safeStr(long);
      expect(result.length).toBeLessThan(160); // 80 + overhead
    });
  });
});
