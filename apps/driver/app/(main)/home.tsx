import { View, Text, StyleSheet } from "react-native";
import { useAuthStore } from "../../src/stores/auth";

export default function HomeScreen() {
  const { userDoc } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        Hello, {userDoc?.displayName ?? "Driver"}
      </Text>

      {userDoc?.companyId ? (
        <Text style={styles.companyStatus}>Connected to company</Text>
      ) : (
        <Text style={styles.noCompany}>
          No company linked yet. Ask your dispatcher to send you a tracking
          request link.
        </Text>
      )}

      <View style={styles.statusCard}>
        <Text style={styles.status}>Offline</Text>
        <Text style={styles.info}>
          Location tracking will be implemented in Phase 3
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  companyStatus: {
    fontSize: 14,
    color: "#22c55e",
    marginBottom: 32,
  },
  noCompany: {
    fontSize: 14,
    color: "#f59e0b",
    marginBottom: 32,
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  status: {
    fontSize: 32,
    fontWeight: "700",
    color: "#999",
    marginBottom: 8,
  },
  info: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
});
