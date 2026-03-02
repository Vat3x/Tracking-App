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
import { getUserDoc } from "../../src/services/auth";
import type { Invite } from "@nexus/shared";

export default function AcceptInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser, setUserDoc } = useAuthStore();

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
      .catch(() => setError("Failed to load invite"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleAccept() {
    if (!invite || !firebaseUser) return;

    setAccepting(true);
    try {
      await acceptInvite(invite.id, firebaseUser.uid);

      // Refresh the user doc to pick up the companyId set by the Cloud Function
      // Small delay to let the function execute
      await new Promise((r) => setTimeout(r, 2000));
      const updatedUser = await getUserDoc(firebaseUser.uid);
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
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={styles.loadingText}>Loading invite...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorTitle}>Cannot Accept Invite</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/(main)/home")}
        >
          <Text style={styles.secondaryButtonText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!firebaseUser) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Tracking Request</Text>
        <Text style={styles.companyName}>{invite?.companyName}</Text>
        <Text style={styles.description}>
          You need to sign in or create an account before accepting this invite.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: "/(auth)/login",
              params: { inviteId: id },
            })
          }
        >
          <Text style={styles.primaryButtonText}>Sign In / Register</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>TRACKING REQUEST</Text>
        <Text style={styles.companyName}>{invite?.companyName}</Text>
        <Text style={styles.description}>
          This company wants to track your location while you are on duty. You
          can go offline at any time to stop sharing your location.
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>What they see:</Text>
          <Text style={styles.infoValue}>
            GPS location, speed, battery level
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Frequency:</Text>
          <Text style={styles.infoValue}>Every 40 minutes while online</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Control:</Text>
          <Text style={styles.infoValue}>
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
        <Text style={styles.secondaryButtonText}>Decline</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
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
    color: "#1a1a1a",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1a73e8",
    letterSpacing: 1,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  companyName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: "#666",
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
    color: "#374151",
    width: 100,
  },
  infoValue: {
    fontSize: 13,
    color: "#6b7280",
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
    color: "#666",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
