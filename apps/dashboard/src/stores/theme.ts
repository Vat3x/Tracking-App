import { create } from "zustand";

type Theme = "light" | "dark";

const STORAGE_KEY = "nexus-theme";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  init: () => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "light",
  toggle: () => {
    const next = get().theme === "light" ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    set({ theme: next });
  },
  init: () => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const theme =
      stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(theme);
    set({ theme });
  },
}));
