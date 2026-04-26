import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { logError, getLoggedErrors, clearLoggedErrors, getErrorCount, generateReportText } from "../lib/errorLogger";

describe("errorLogger", () => {
  beforeEach(() => {
    clearLoggedErrors();
    // Spy on console.error to suppress output during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearLoggedErrors();
  });

  describe("logError", () => {
    it("should log an error and return entry with id", () => {
      const err = new Error("test error");
      const result = logError(err);
      
      expect(result.id).toBeDefined();
      expect(result.message).toBe("test error");
      expect(result.timestamp).toBeTypeOf("number");
      expect(result.stack).toBe(err.stack);
    });

    it("should store errors in localStorage", () => {
      logError(new Error("first"));
      logError(new Error("second"));
      
      expect(getErrorCount()).toBe(2);
    });

    it("should store componentStack from ErrorInfo", () => {
      const err = new Error("react error");
      const result = logError(err, {
        componentStack: "at Component\n  at App",
      });
      
      expect(result.componentStack).toContain("Component");
    });

    it("should handle errors without stack", () => {
      const err = new Error("no stack");
      err.stack = undefined;
      const result = logError(err);
      
      // Should not throw - stack is optional
      expect(result.message).toBe("no stack");
    });

    it("should include user agent", () => {
      const result = logError(new Error("ua test"));
      expect(result.userAgent).toBeTruthy();
    });

    it("should generate unique IDs for each error", () => {
      const r1 = logError(new Error("a"));
      const r2 = logError(new Error("b"));
      
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe("getLoggedErrors", () => {
    it("should return errors newest first", () => {
      logError(new Error("oldest"));
      logError(new Error("newest"));
      
      const errors = getLoggedErrors();
      expect(errors[0].message).toBe("newest");
      expect(errors[1].message).toBe("oldest");
    });

    it("should return empty array when no errors", () => {
      expect(getLoggedErrors()).toHaveLength(0);
    });
  });

  describe("clearLoggedErrors", () => {
    it("should remove all logged errors", () => {
      logError(new Error("to be cleared"));
      expect(getErrorCount()).toBe(1);
      
      clearLoggedErrors();
      expect(getErrorCount()).toBe(0);
    });
  });

  describe("getErrorCount", () => {
    it("should return correct count after multiple logs", () => {
      expect(getErrorCount()).toBe(0);
      logError(new Error("a"));
      expect(getErrorCount()).toBe(1);
      logError(new Error("b"));
      logError(new Error("c"));
      expect(getErrorCount()).toBe(3);
    });
  });

  describe("generateReportText", () => {
    it("should generate formatted report with key fields", () => {
      const error = logError(new Error("report test"));
      const text = generateReportText(error);
      
      expect(text).toContain("ZSSH Error Report");
      expect(text).toContain("report test");
      expect(text).toContain("Timestamp:");
      expect(text).toContain("App Version:");
    });

    it("should include stack trace when available", () => {
      const error = logError(new Error("with stack"));
      const text = generateReportText(error);
      
      if (error.stack) {
        expect(text).toContain("Stack Trace:");
      }
    });

    it("should include component stack when available", () => {
      const error = logError(
        new Error("component"),
        { componentStack: "at Foo\n  at Bar" }
      );
      const text = generateReportText(error);
      
      expect(text).toContain("Component Stack:");
      expect(text).toContain("Foo");
    });

    it("should include GitHub issue URL hint", () => {
      const error = logError(new Error("url test"));
      const text = generateReportText(error);
      
      expect(text).toContain("github.com");
    });
  });
});
