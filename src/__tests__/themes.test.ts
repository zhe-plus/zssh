import { describe, it, expect, beforeEach } from "vitest";
import { themes, DEFAULT_THEME, applyTheme, type ThemeKey, type ThemeColors } from "../lib/themes";

describe("themes", () => {
  describe("theme definitions", () => {
    it("should have at least 10 built-in themes", () => {
      expect(Object.keys(themes).length).toBeGreaterThanOrEqual(10);
    });

    it("should include all expected theme names", () => {
      const expectedThemes = [
        "dark", "monokai", "solarized-dark", "dracula", "nord",
        "github-dark", "one-dark", "tokyo-night", "material", "cobalt",
      ];
      expectedThemes.forEach((name) => {
        expect(themes[name]).toBeDefined();
      });
    });
  });

  describe("theme colors structure", () => {
    it.each(Object.keys(themes) as ThemeKey[])(
      "theme '%s' should have required CSS variables",
      (themeKey) => {
        const colors = themes[themeKey];
        // Required variables that every theme must have
        expect(colors["--color-gray-950"]).toBeDefined();
        expect(colors["--color-gray-900"]).toBeDefined();
        expect(colors["--color-gray-800"]).toBeDefined();
        expect(colors["--color-blue-600"]).toBeDefined();
        expect(colors["--color-blue-500"]).toBeDefined();

        // All values should be valid hex colors
        Object.values(colors).forEach((value) => {
          expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
        });
      }
    );

    it("should have different color schemes per theme", () => {
      const themeNames = Object.keys(themes) as ThemeKey[];
      const colorSets = themeNames.map((t) => JSON.stringify(themes[t]));
      const uniqueSets = new Set(colorSets);
      expect(uniqueSets.size).toBe(themeNames.length);
    });
  });

  describe("DEFAULT_THEME", () => {
    it("should be 'github-dark'", () => {
      expect(DEFAULT_THEME).toBe("github-dark");
    });

    it("should reference an existing theme", () => {
      expect(themes[DEFAULT_THEME]).toBeDefined();
    });
  });

  describe("applyTheme", () => {
    let styleBackup: Record<string, string>;
    
    beforeEach(() => {
      // Backup and clear existing styles
      styleBackup = {};
      const root = document.documentElement;
      Object.keys(themes[DEFAULT_THEME]).forEach((cssVar) => {
        styleBackup[cssVar] = root.style.getPropertyValue(cssVar);
      });
    });

    afterEach(() => {
      // Restore original styles
      const root = document.documentElement;
      Object.entries(styleBackup).forEach(([varName, value]) => {
        if (value) root.style.setProperty(varName, value);
      });
    });

    it("should apply theme CSS variables to documentElement", () => {
      applyTheme("dracula");

      const draculaTheme = themes["dracula"];
      Object.entries(draculaTheme).forEach(([cssVar, value]) => {
        expect(document.documentElement.style.getPropertyValue(cssVar)).toBe(value);
      });
    });

    it("should fall back to default theme for unknown key", () => {
      applyTheme("nonexistent-theme" as ThemeKey);

      const defaultColors = themes[DEFAULT_THEME];
      Object.entries(defaultColors).forEach(([cssVar, value]) => {
        expect(document.documentElement.style.getPropertyValue(cssVar)).toBe(value);
      });
    });

    it("should override previous theme when applying different one", () => {
      applyTheme("nord");
      const nordGray950 = themes["nord"]["--color-gray-950"];

      applyTheme("monokai");
      const monokaiGray950 = themes["monokai"]["--color-gray-950"];

      expect(nordGray950).not.toBe(monokaiGray950);
      expect(document.documentElement.style.getPropertyValue("--color-gray-950")).toBe(monokaiGray950);
    });
  });
});
