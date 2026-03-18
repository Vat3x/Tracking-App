import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getInvite, acceptInvite } from "../../src/services/invites";
import { useAuthStore } from "../../src/stores/auth";
import { useTheme } from "../../src/hooks/useTheme";
import { getUserDoc } from "../../src/services/auth";
import type { Invite } from "@nexus/shared";

export default function AcceptInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser, setUserDoc } = useAuthStore();
  const { colors, isDark } = useTheme();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Invalid invite link");
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      getInvite(id)
        .then((inv) => {
          if (!inv) {
            setError("Invite not found");
          } else if (inv.status === "accepted") {
            setError("This invite has already been used");
          } else if (inv.status === "expired" || inv.expiresAt < Date.now()) {
            setError("This invite has expired");
          } else {
            setInvite(inv);
          }
        })
        .catch((err) => {
          console.error("Invite load error:", err?.code, err?.message);
          setError(`Failed to load invite: ${err?.code || err?.message || "unknown"}`);
        })
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [id]);

  async function handleAccept() {
    if (!invite || !firebaseUser) return;

    setAccepting(true);
    try {
      await acceptInvite(invite.id, firebaseUser.uid);
      // Poll until cloud function sets companyId (up to ~10s)
      let updatedUser = null;
      for (let i = 0; i < 7; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        updatedUser = await getUserDoc(firebaseUser.uid);
        if (updatedUser?.companyId) break;
      }
      if (updatedUser) setUserDoc(updatedUser);

      Alert.alert(
        "Connected!",
        `You are now linked to ${invite.companyName}. Your dispatcher can see your location when you go online.`,
        [{ text: "OK", onPress: () => router.replace("/(main)/home") }]
      );
    } catch {
      Alert.alert("Error", "Failed to accept invite. Please try again.");
    } finally {
      setAccepting(false);
    }
  }

  function handleDecline() {
    router.back();
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading invite...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorIcon, isDark && { backgroundColor: "#450a0a" }]}>!</Text>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Cannot Accept Invite</Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/(main)/home")}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!firebaseUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.screenTitle, { color: colors.text }]}>Tracking Request</Text>
        <Text style={[styles.companyName, { color: colors.text }]}>{invite?.companyName}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          You need to sign in or create an account before accepting this invite.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: "/(auth)/login",
              params: { inviteId: id, inviteCompanyName: invite?.companyName },
            })
          }
        >
          <Text style={styles.primaryButtonText}>Sign In / Register</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={styles.badge}>TRACKING REQUEST</Text>
        <Text style={[styles.companyName, { color: colors.text }]}>{invite?.companyName}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          This company wants to track your location while you are on duty. You
          can go offline at any time to stop sharing your location.
        </Text>

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text }]}>What they see:</Text>
          <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
            GPS location, speed, battery level
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text }]}>Frequency:</Text>
          <Text style={[styles.infoValue, { color: colors.textSecondary }]}>Every 40 minutes while online</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text }]}>Control:</Text>
          <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
            Toggle online/offline anytime from the home screen
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, accepting && styles.buttonDisabled]}
        onPress={handleAccept}
        disabled={accepting}
      >
        {accepting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Accept & Connect</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={handleDecline}
        disabled={accepting}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Decline</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorIcon: {
    fontSize: 40,
    fontWeight: "700",
    color: "#dc2626",
    width: 64,
    height: 64,
    lineHeight: 64,
    textAlign: "center",
    backgroundColor: "#fee2e2",
    borderRadius: 32,
    marginBottom: 16,
    overflow: "hidden",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1a73e8",
    letterSpacing: 1,
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  companyName: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
    width: 100,
  },
  infoValue: {
    fontSize: 13,
    flex: 1,
  },
  primaryButton: {
    width: "100%",
    height: 50,
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    width: "100%",
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
