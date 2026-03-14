import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useThemeStore } from "../../src/stores/theme";

/**
 * Catch deep links like https://tracking.loadmind.app/invite/{id}
 * and redirect to the actual accept-invite screen.
 */
export default function InviteRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bg = useThemeStore((s) => s.colors.bg);

  useEffect(() => {
    if (id) {
      router.replace({
        pathname: "/(auth)/accept-invite",
        params: { id },
      });
    }
  }, [id, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: bg }}>
      <ActivityIndicator size="large" color="#1a73e8" />
    </View>
  );
}
