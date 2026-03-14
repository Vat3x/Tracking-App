import { useThemeStore } from "../stores/theme";
import { MAP_STYLE, MAP_STYLE_DARK } from "../constants/mapStyle";

export function useTheme() {
  const { colors, isDark, preference, toggle, setPreference } = useThemeStore();
  return {
    colors,
    isDark,
    preference,
    toggle,
    setPreference,
    mapStyle: isDark ? MAP_STYLE_DARK : MAP_STYLE,
    statusBarStyle: (isDark ? "light" : "dark") as "light" | "dark",
  };
}
