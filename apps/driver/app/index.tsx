import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useThemeStore } from "../src/stores/theme";

export default function SplashScreen() {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ActivityIndicator size="large" color="#1a73e8" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
