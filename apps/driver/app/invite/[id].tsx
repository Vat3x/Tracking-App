import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../src/stores/auth";
import { useThemeStore } from "../../src/stores/theme";

/**
 * Catch deep links like https://tracking-app-f6ad7.web.app/invite/{id}
 * Saves invite ID to store + AsyncStorage, then routes:
 * - Authenticated → accept-invite screen
 * - Not authenticated → login screen with invite context
 */
export default function InviteRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bg = useThemeStore((s) => s.colors.bg);
  const { firebaseUser, userDoc, setPendingInviteId } = useAuthStore();

  useEffect(() => {
    if (!id) return;

    // Persist invite ID so it survives navigation and OTA restarts
    setPendingInviteId(id);
    AsyncStorage.setItem("@pending_invite_id", id);

    if (firebaseUser && userDoc) {
      // Authenticated driver — go to accept-invite
      router.replace({
        pathname: "/(auth)/accept-invite",
        params: { id },
      });
    } else {
      // Not authenticated — go to login with invite context
      router.replace({
        pathname: "/(auth)/login",
        params: { inviteId: id },
      });
    }
  }, [id, router, firebaseUser, userDoc]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: bg }}>
      <ActivityIndicator size="large" color="#1a73e8" />
    </View>
  );
}
