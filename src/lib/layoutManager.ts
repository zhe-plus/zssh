export interface LayoutSnapshot {
  id: string;
  name: string;
  direction: "horizontal" | "vertical";
  panelSizes: number[]; // percentages
  sftpOpen: boolean;
  sftpDirection: "horizontal" | "vertical";
  sidebarVisible: boolean;
  createdAt: number;
}

const STORAGE_KEY = "zssh_layouts";

function getStoredLayouts(): LayoutSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredLayouts(layouts: LayoutSnapshot[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {}
}

// Preset layouts
export const PRESET_LAYOUTS: Omit<LayoutSnapshot, "id" | "createdAt">[] = [
  { name: "terminal-full", direction: "horizontal", panelSizes: [100], sftpOpen: false, sftpDirection: "horizontal", sidebarVisible: true },
  { name: "sftp-horizontal", direction: "horizontal", panelSizes: [60, 40], sftpOpen: true, sftpDirection: "horizontal", sidebarVisible: true },
  { name: "sftp-vertical", direction: "vertical", panelSizes: [60, 40], sftpOpen: true, sftpDirection: "vertical", sidebarVisible: true },
  { name: "three-column", direction: "horizontal", panelSizes: [25, 50, 25], sftpOpen: true, sftpDirection: "horizontal", sidebarVisible: true },
];

/**
 * Save current layout state as a named snapshot
 */
export function saveLayout(name: string, snapshot: Omit<LayoutSnapshot, "id" | "name" | "createdAt">): LayoutSnapshot {
  const layouts = getStoredLayouts();
  const newLayout: LayoutSnapshot = {
    ...snapshot,
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name,
    createdAt: Date.now(),
  };

  // Update or create
  const existingIdx = layouts.findIndex((l) => l.name === name);
  if (existingIdx >= 0) {
    layouts[existingIdx] = newLayout;
  } else {
    layouts.push(newLayout);
  }

  setStoredLayouts(layouts);
  return newLayout;
}

/**
 * Load a saved layout by name or id
 */
export function loadLayout(nameOrId: string): LayoutSnapshot | null {
  const layouts = getStoredLayouts();
  // Try finding by id first, then by name
  return (
    layouts.find((l) => l.id === nameOrId) ??
    layouts.find((l) => l.name === nameOrId) ??
    null
  );
}

/**
 * Get list of saved custom layouts (excluding presets)
 */
export function getCustomLayouts(): LayoutSnapshot[] {
  return getStoredLayouts().filter(
    (l) => !PRESET_LAYOUTS.some((p) => p.name === l.name),
  );
}

/**
 * Get all available layouts (presets + custom)
 */
export function getAllLayouts(): LayoutSnapshot[] {
  const presetsWithId: LayoutSnapshot[] = PRESET_LAYOUTS.map((p) => ({
    ...p,
    id: `preset-${p.name}`,
    createdAt: 0,
  }));
  return [...presetsWithId, ...getStoredLayouts()];
}

/**
 * Delete a saved layout
 */
export function deleteLayout(id: string): void {
  const layouts = getStoredLayouts().filter((l) => l.id !== id);
  setStoredLayouts(layouts);
}

/**
 * Save the last used layout for automatic restore on startup
 */
export function saveLastLayout(snapshot: Omit<LayoutSnapshot, "id" | "name" | "createdAt">): void {
  try {
    localStorage.setItem("zssh_last_layout", JSON.stringify({
      ...snapshot,
      savedAt: Date.now(),
    }));
  } catch {}
}

/**
 * Get the last saved layout for auto-restore
 */
export function getLastLayout(): Omit<LayoutSnapshot, "id" | "name" | "createdAt"> | null {
  try {
    const raw = localStorage.getItem("zssh_last_layout");
    if (!raw) return null;
    const data = JSON.parse(raw);

    // Only use if saved within last 30 days
    if (data.savedAt && Date.now() - data.savedAt > 30 * 24 * 60 * 60 * 1000) {
      return null;
    }

    const { savedAt, ...layout } = data;
    return layout;
  } catch {
    return null;
  }
}
