import { describe, it, expect } from "vitest";
import { cn } from "../lib/cn";

describe("cn utility", () => {
  it("should merge class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("should handle empty inputs", () => {
    expect(cn()).toBe("");
    expect(cn("", "")).toBe("");
  });

  it("should handle conditional classes (falsy values)", () => {
    expect(cn("base", false && "hidden", null, undefined, 0, "visible")).toBe(
      "base visible"
    );
  });

  it("should deduplicate Tailwind classes with tailwind-merge", () => {
    // tailwind-merge handles conflicting classes like px-4 vs px-2
    // px-2 should win over px-4 (last one wins)
    const result = cn("px-4 py-2", "px-2");
    // The result should contain px-2 (the later value takes precedence)
    expect(result).toContain("px-2");
    expect(result).toContain("py-2");
    // Should NOT contain both px-4 AND px-2
    expect(!result.includes("px-4") || !result.includes("px-2") || result.match(/px-\d/g)!.length <= 1).toBe(true);
  });

  it("should merge arrays of classes", () => {
    expect(cn(["a", "b"], ["c"])).toBe("a b c");
  });

  it("should handle objects with boolean values", () => {
    expect(cn({ active: true, hidden: false, visible: true })).toBe(
      "active visible"
    );
  });
});
