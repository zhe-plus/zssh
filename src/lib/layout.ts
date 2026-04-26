export type LayoutMode = "compact" | "comfortable";

export function isCompactLayout(mode: string | null | undefined): boolean {
  return mode === "compact";
}

