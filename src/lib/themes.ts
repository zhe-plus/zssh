/**
 * 主题色彩配置
 * 每个主题定义一组 CSS 变量映射，用于动态切换 UI 配色方案
 */

export type ThemeKey = string;

export interface ThemeColors {
  [cssVar: string]: string;
}

export const themes: Record<ThemeKey, ThemeColors> = {
  dark: {
    "--color-gray-950": "#0a0a0a",
    "--color-gray-900": "#171717",
    "--color-gray-850": "#1a1a1a",
    "--color-gray-800": "#262626",
    "--color-gray-750": "#2a2a2a",
    "--color-gray-700": "#404040",
    "--color-blue-600": "#3b82f6",
    "--color-blue-500": "#60a5fa",
    "--color-blue-700": "#2563eb",
  },
  monokai: {
    "--color-gray-950": "#1a1a1a",
    "--color-gray-900": "#272822",
    "--color-gray-850": "#2a2a24",
    "--color-gray-800": "#3e3d32",
    "--color-gray-750": "#464640",
    "--color-gray-700": "#75715e",
    "--color-blue-600": "#a6e22e",
    "--color-blue-500": "#bef264",
    "--color-blue-700": "#84cc16",
  },
  "solarized-dark": {
    "--color-gray-950": "#001e27",
    "--color-gray-900": "#002b36",
    "--color-gray-850": "#013642",
    "--color-gray-800": "#073642",
    "--color-gray-750": "#094451",
    "--color-gray-700": "#586e75",
    "--color-blue-600": "#268bd2",
    "--color-blue-500": "#38bdf8",
    "--color-blue-700": "#0284c7",
  },
  dracula: {
    "--color-gray-950": "#1e1f29",
    "--color-gray-900": "#282a36",
    "--color-gray-850": "#2a2c3a",
    "--color-gray-800": "#44475a",
    "--color-gray-750": "#4a4d62",
    "--color-gray-700": "#6272a4",
    "--color-blue-600": "#bd93f9",
    "--color-blue-500": "#c4b5fd",
    "--color-blue-700": "#8b5cf6",
  },
  nord: {
    "--color-gray-950": "#242933",
    "--color-gray-900": "#2e3440",
    "--color-gray-850": "#323844",
    "--color-gray-800": "#3b4252",
    "--color-gray-750": "#424a5c",
    "--color-gray-700": "#4c566a",
    "--color-blue-600": "#88c0d0",
    "--color-blue-500": "#7dd3fc",
    "--color-blue-700": "#0284c7",
  },
  "github-dark": {
    "--color-gray-950": "#010409",
    "--color-gray-900": "#0d1117",
    "--color-gray-850": "#101419",
    "--color-gray-800": "#161b22",
    "--color-gray-750": "#1c2128",
    "--color-gray-700": "#21262d",
    "--color-blue-600": "#58a6ff",
    "--color-blue-500": "#2f81f7",
    "--color-blue-700": "#1f6feb",
  },
  "one-dark": {
    "--color-gray-950": "#1e2127",
    "--color-gray-900": "#282c34",
    "--color-gray-850": "#2c313a",
    "--color-gray-800": "#21252b",
    "--color-gray-750": "#2d313a",
    "--color-gray-700": "#3e4451",
    "--color-blue-600": "#61afef",
    "--color-blue-500": "#93c5fd",
    "--color-blue-700": "#2563eb",
  },
  "tokyo-night": {
    "--color-gray-950": "#16161e",
    "--color-gray-900": "#1a1b26",
    "--color-gray-850": "#1e1f2a",
    "--color-gray-800": "#24283b",
    "--color-gray-750": "#292e42",
    "--color-gray-700": "#414868",
    "--color-blue-600": "#7aa2f7",
    "--color-blue-500": "#93c5fd",
    "--color-blue-700": "#2563eb",
  },
  material: {
    "--color-gray-950": "#1a1f24",
    "--color-gray-900": "#263238",
    "--color-gray-850": "#2a343a",
    "--color-gray-800": "#1e272e",
    "--color-gray-750": "#243036",
    "--color-gray-700": "#37474f",
    "--color-blue-600": "#82aaff",
    "--color-blue-500": "#93c5fd",
    "--color-blue-700": "#2563eb",
  },
  cobalt: {
    "--color-gray-950": "#001528",
    "--color-gray-900": "#002240",
    "--color-gray-850": "#012744",
    "--color-gray-800": "#193549",
    "--color-gray-750": "#1e3d52",
    "--color-gray-700": "#1f4662",
    "--color-blue-600": "#0088ff",
    "--color-blue-500": "#38bdf8",
    "--color-blue-700": "#0284c7",
  },
};

/** 默认主题 */
export const DEFAULT_THEME = "github-dark";

/** 将主题色应用到 document.documentElement */
export function applyTheme(themeKey: ThemeKey): void {
  const vars = themes[themeKey] ?? themes[DEFAULT_THEME];
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
}
