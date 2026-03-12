import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../src/services/firebase";
import { logout } from "../../src/services/auth";
import { useAuthStore } from "../../src/stores/auth";
import { clearFcmToken } from "../../src/services/notifications";
import { COLLECTIONS } from "@nexus/shared";

export default function SettingsScreen() {
  const router = useRouter();
  const { userDoc, reset } = useAuthStore();
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (!userDoc?.companyId) return;
    getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
      if (snap.exists()) setCompanyName(snap.data().name ?? null);
    });
  }, [userDoc?.companyId]);

  async function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          if (userDoc?.id) {
            await clearFcmToken(userDoc.id).catch(() => {});
          }
          await logout();
          reset();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <ScrollView style={styles.container}>
      {/* Profile Section */}
      <Text style={styles.sectionHeader}>Profile</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{userDoc?.displayName ?? "—"}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>{userDoc?.email ? "Email" : "Phone"}</Text>
          <Text style={styles.value}>{userDoc?.email ?? userDoc?.phone ?? "—"}</Text>
        </View>
      </View>

      {/* Company Section */}
      <Text style={styles.sectionHeader}>Company</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Company</Text>
          <Text style={styles.value}>
            {companyName ?? (userDoc?.companyId ? "Loading..." : "Not linked")}
          </Text>
        </View>
      </View>

      {/* App Section */}
      <Text style={styles.sectionHeader}>App</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>{appVersion}</Text>
        </View>
      </View>

      {/* Account Section */}
      <View style={{ marginTop: 24, paddingBottom: 40 }}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginLeft: 16,
  },
  label: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    color: "#1a1a1a",
  },
  logoutButton: {
    height: 48,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutText: {
    color: "#dc2626",
    fontSize: 16,
    fontWeight: "600",
  },
});
