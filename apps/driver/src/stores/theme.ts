import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { COLORS, type ThemeColors } from "../constants/colors";

type ThemePreference = "light" | "dark" | "system";

interface ThemeState {
  preference: ThemePreference;
  resolvedTheme: "light" | "dark";
  colors: ThemeColors;
  isDark: boolean;

  init: () => Promise<void>;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
}

const STORAGE_KEY = "loadmind-theme";

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    return Appearance.getColorScheme() === "dark" ? "dark" : "light";
  }
  return pref;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: "system",
  resolvedTheme: resolve("system"),
  colors: COLORS[resolve("system")],
  isDark: resolve("system") === "dark",

  init: async () => {
    try {
      const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemePreference | null;
      const pref = stored ?? "system";
      const resolved = resolve(pref);
      set({
        preference: pref,
        resolvedTheme: resolved,
        colors: COLORS[resolved],
        isDark: resolved === "dark",
      });
    } catch {
      // AsyncStorage error — keep defaults
    }

    Appearance.addChangeListener(({ colorScheme }) => {
      const current = get();
      if (current.preference === "system") {
        const r = colorScheme === "dark" ? "dark" : "light";
        set({ resolvedTheme: r, colors: COLORS[r], isDark: r === "dark" });
      }
    });
  },

  setPreference: (pref) => {
    const resolved = resolve(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref);
    set({
      preference: pref,
      resolvedTheme: resolved,
      colors: COLORS[resolved],
      isDark: resolved === "dark",
    });
  },

  toggle: () => {
    const next: ThemePreference = get().isDark ? "light" : "dark";
    get().setPreference(next);
  },
}));
