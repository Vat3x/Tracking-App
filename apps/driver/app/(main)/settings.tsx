import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { logout } from "../../src/services/auth";
import { useAuthStore } from "../../src/stores/auth";

export default function SettingsScreen() {
  const router = useRouter();
  const { userDoc, reset } = useAuthStore();

  async function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          reset();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{userDoc?.displayName ?? "—"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{userDoc?.email ?? "—"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{userDoc?.role ?? "—"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Company</Text>
        <Text style={styles.value}>
          {userDoc?.companyId ? "Linked" : "Not linked"}
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
  },
  section: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
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
    marginTop: 32,
    height: 48,
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutText: {
    color: "#dc2626",
    fontSize: 16,
    fontWeight: "600",
  },
});
