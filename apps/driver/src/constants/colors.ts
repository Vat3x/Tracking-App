// Centralized color palettes for light and dark themes.
// Semantic/action colors (green, blue, red, amber) stay constant in both themes.

export const COLORS = {
  light: {
    // Backgrounds
    bg: "#fff",
    bgSecondary: "#f5f5f5",
    bgCard: "#f9fafb",
    bgOverlay: "rgba(255,255,255,0.92)",
    bgOverlayStrong: "rgba(255,255,255,0.95)",

    // Borders
    border: "#e5e7eb",
    borderLight: "#f0f0f0",

    // Text
    text: "#1a1a1a",
    textSecondary: "#6b7280",
    textMuted: "#9ca3af",

    // Input
    inputBg: "#fafafa",
    inputBorder: "#ddd",
    inputText: "#000",
    placeholder: "#999",

    // Dividers
    divider: "#f0f0f0",
    routeLine: "#d1d5db",

    // Surfaces
    toggleBg: "#f0f0f0",
    statusRowBg: "#f9fafb",
    statusRowBorder: "#e5e7eb",
    onlineRowBg: "#f0fdf4",
    onlineRowBorder: "#bbf7d0",
    warningBg: "#fffbeb",
    warningBorder: "#fde68a",
    warningTitle: "#92400e",
    warningText: "#a16207",
    activeTripBg: "#eff6ff",
    activeTripBorder: "#bfdbfe",

    // Tab / Header
    tabBarBg: "#fff",
    tabBarBorder: "#e5e7eb",
    headerBg: "#fff",

    // Splash
    splashBg: "#fff",
  },
  dark: {
    bg: "#0f0f0f",
    bgSecondary: "#1a1a1a",
    bgCard: "#1e1e1e",
    bgOverlay: "rgba(15,15,15,0.92)",
    bgOverlayStrong: "rgba(15,15,15,0.95)",

    border: "#2e2e2e",
    borderLight: "#262626",

    text: "#f0f0f0",
    textSecondary: "#9ca3af",
    textMuted: "#6b7280",

    inputBg: "#1e1e1e",
    inputBorder: "#333",
    inputText: "#f0f0f0",
    placeholder: "#6b7280",

    divider: "#2e2e2e",
    routeLine: "#4b5563",

    toggleBg: "#262626",
    statusRowBg: "#1a1a1a",
    statusRowBorder: "#2e2e2e",
    onlineRowBg: "#052e16",
    onlineRowBorder: "#166534",
    warningBg: "#451a03",
    warningBorder: "#92400e",
    warningTitle: "#fbbf24",
    warningText: "#fcd34d",
    activeTripBg: "#172554",
    activeTripBorder: "#1e40af",

    tabBarBg: "#111111",
    tabBarBorder: "#2e2e2e",
    headerBg: "#111111",

    splashBg: "#0f0f0f",
  },
} as const;

export type ThemeColors = { [K in keyof (typeof COLORS)["light"]]: string };
