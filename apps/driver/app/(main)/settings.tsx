import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../src/services/firebase";
import { logout, deleteAccount } from "../../src/services/auth";
import { useAuthStore } from "../../src/stores/auth";
import { clearFcmToken } from "../../src/services/notifications";
import { COLLECTIONS } from "@nexus/shared";
import { useTheme } from "../../src/hooks/useTheme";
import type { ThemeColors } from "../../src/constants/colors";

type ThemePref = "system" | "light" | "dark";
const THEME_OPTIONS: { key: ThemePref; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { userDoc, reset } = useAuthStore();
  const { colors, isDark, preference, setPreference } = useTheme();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all associated data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert("Are you sure?", "Your account, trip history, and location data will be permanently removed.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete Forever",
                style: "destructive",
                onPress: async () => {
                  setDeleting(true);
                  try {
                    if (userDoc?.id) {
                      await clearFcmToken(userDoc.id).catch(() => {});
                    }
                    await deleteAccount();
                    reset();
                    router.replace("/(auth)/login");
                  } catch (err) {
                    Alert.alert("Error", "Failed to delete account. Please try again.");
                    setDeleting(false);
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  }

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bgSecondary }]}>
      {/* Profile Section */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Profile</Text>
      <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
          <Text style={[styles.value, { color: colors.text }]}>{userDoc?.displayName ?? "—"}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{userDoc?.email ? "Email" : "Phone"}</Text>
          <Text style={[styles.value, { color: colors.text }]}>{userDoc?.email ?? userDoc?.phone ?? "—"}</Text>
        </View>
      </View>

      {/* Company Section */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Company</Text>
      <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Company</Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {companyName ?? (userDoc?.companyId ? "Loading..." : "Not linked")}
          </Text>
        </View>
      </View>

      {/* Appearance Section */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Appearance</Text>
      <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.themeOption,
                { backgroundColor: colors.toggleBg },
                preference === opt.key && styles.themeOptionActive,
              ]}
              onPress={() => setPreference(opt.key)}
            >
              <Text
                style={[
                  styles.themeOptionText,
                  { color: colors.textSecondary },
                  preference === opt.key && styles.themeOptionTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* App Section */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>App</Text>
      <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Version</Text>
          <Text style={[styles.value, { color: colors.text }]}>{appVersion}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL("https://load-mind.com/privacy")}
        >
          <Text style={[styles.value, { color: "#1a73e8" }]}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>

      {/* Account Section */}
      <View style={{ marginTop: 24, gap: 12, paddingBottom: 40 }}>
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: isDark ? "#450a0a" : "#fee2e2" }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: isDark ? "#fca5a5" : "#dc2626" }]}>Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: isDark ? "#7f1d1d" : "#dc2626" }]}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          <Text style={[styles.logoutText, { color: "#fff" }]}>
            {deleting ? "Deleting..." : "Delete Account"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: {
    height: 1,
    marginLeft: 16,
  },
  label: {
    fontSize: 12,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
  },
  themeRow: {
    flexDirection: "row",
    padding: 8,
    gap: 8,
  },
  themeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  themeOptionActive: {
    backgroundColor: "#1a73e8",
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: "500",
  },
  themeOptionTextActive: {
    color: "#fff",
  },
  logoutButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
