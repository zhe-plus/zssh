import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveLayout,
  loadLayout,
  getAllLayouts,
  deleteLayout,
  saveLastLayout,
  getLastLayout,
  PRESET_LAYOUTS,
} from "../lib/layoutManager";

describe("layoutManager", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("PRESET_LAYOUTS", () => {
    it("should have 4 preset layouts", () => {
      expect(PRESET_LAYOUTS).toHaveLength(4);
    });

    it("should have terminal-full preset with sftpOpen=false", () => {
      const fullPreset = PRESET_LAYOUTS.find((p) => p.name === "terminal-full");
      expect(fullPreset).toBeDefined();
      expect(fullPreset!.sftpOpen).toBe(false);
      expect(fullPreset!.panelSizes).toEqual([100]);
    });

    it("should have horizontal split preset", () => {
      const hPreset = PRESET_LAYOUTS.find((p) => p.name === "sftp-horizontal");
      expect(hPreset).toBeDefined();
      expect(hPreset!.sftpDirection).toBe("horizontal");
    });

    it("should have vertical split preset", () => {
      const vPreset = PRESET_LAYOUTS.find((p) => p.name === "sftp-vertical");
      expect(vPreset).toBeDefined();
      expect(vPreset!.sftpDirection).toBe("vertical");
    });

    it("should have three-column preset", () => {
      const threePreset = PRESET_LAYOUTS.find((p) => p.name === "three-column");
      expect(threePreset).toBeDefined();
      expect(threePreset!.panelSizes).toHaveLength(3);
      expect(threePreset!.panelSizes.reduce((a, b) => a + b, 0)).toBe(100);
    });
  });

  describe("saveLayout & loadLayout", () => {
    it("should save and retrieve layout by name", () => {
      saveLayout("my-custom", {
        direction: "horizontal",
        panelSizes: [70, 30],
        sftpOpen: true,
        sftpDirection: "vertical",
        sidebarVisible: false,
      });

      const loaded = loadLayout("my-custom");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("my-custom");
      expect(loaded!.panelSizes).toEqual([70, 30]);
      expect(loaded!.sidebarVisible).toBe(false);
    });

    it("should update existing layout when saving with same name", () => {
      saveLayout("test-layout", {
        direction: "horizontal",
        panelSizes: [60, 40],
        sftpOpen: true,
        sftpDirection: "horizontal",
        sidebarVisible: true,
      });

      saveLayout("test-layout", {
        direction: "vertical",
        panelSizes: [50, 50],
        sftpOpen: false,
        sftpDirection: "horizontal",
        sidebarVisible: false,
      });

      const loaded = loadLayout("test-layout");
      expect(loaded!.direction).toBe("vertical");
      expect(loaded!.panelSizes).toEqual([50, 50]);
      // Only one custom layout should exist
      const allCustom = getAllLayouts().filter((l) => !l.id.startsWith("preset-"));
      expect(allCustom.filter((l) => l.name === "test-layout")).toHaveLength(1);
    });

    it("should generate unique ID for each saved layout", () => {
      const l1 = saveLayout("first", PRESET_LAYOUTS[0]);
      const l2 = saveLayout("second", PRESET_LAYOUTS[1]);
      expect(l1.id).not.toBe(l2.id);
    });

    it("should return null for non-existent layout", () => {
      expect(loadLayout("nonexistent")).toBeNull();
    });

    it("should load layout by ID as well", () => {
      const saved = saveLayout("id-test", PRESET_LAYOUTS[0]);
      const loadedById = loadLayout(saved.id);
      expect(loadedById).not.toBeNull();
      expect(loadedById!.id).toBe(saved.id);
    });

    it("should store createdAt timestamp", () => {
      const before = Date.now();
      const saved = saveLayout("timestamp-test", PRESET_LAYOUTS[0]);
      const after = Date.now();
      expect(saved.createdAt).toBeGreaterThanOrEqual(before);
      expect(saved.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe("getAllLayouts", () => {
    it("should return presets plus custom layouts", () => {
      saveLayout("custom1", PRESET_LAYOUTS[0]);
      saveLayout("custom2", PRESET_LAYOUTS[1]);

      const all = getAllLayouts();
      const presets = all.filter((l) => l.id.startsWith("preset-"));
      const customs = all.filter((l) => !l.id.startsWith("preset-"));

      expect(presets).toHaveLength(4); // 4 presets
      expect(customs).toHaveLength(2); // 2 custom
    });
  });

  describe("deleteLayout", () => {
    it("should remove a custom layout", () => {
      const saved = saveLayout("to-delete", PRESET_LAYOUTS[0]);
      expect(loadLayout("to-delete")).not.toBeNull();

      deleteLayout(saved.id);
      expect(loadLayout("to-delete")).toBeNull();
    });
  });

  describe("saveLastLayout & getLastLayout", () => {
    it("should save and retrieve last used layout", () => {
      saveLastLayout({
        direction: "vertical",
        panelSizes: [55, 45],
        sftpOpen: true,
        sftpDirection: "vertical",
        sidebarVisible: true,
      });

      const last = getLastLayout();
      expect(last).not.toBeNull();
      expect(last!.direction).toBe("vertical");
      expect(last!.panelSizes).toEqual([55, 45]);
      // Last layout should not have id/name/createdAt
      expect((last as any).id).toBeUndefined();
    });

    it("should return null when no last layout is saved", () => {
      expect(getLastLayout()).toBeNull();
    });

    it("should overwrite previous last layout", () => {
      saveLastLayout({ ...PRESET_LAYOUTS[0], sidebarVisible: true });
      saveLastLayout({ ...PRESET_LAYOUTS[1], sidebarVisible: false });

      const last = getLastLayout();
      expect(last!.sftpOpen).toBe(PRESET_LAYOUTS[1].sftpOpen);
    });
  });
});
