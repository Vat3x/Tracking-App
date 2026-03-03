import { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
  Linking,
  TouchableOpacity,
} from "react-native";
import { useAuthStore } from "../../src/stores/auth";
import { useTrackingStore } from "../../src/stores/tracking";
import {
  requestForegroundPermission,
  requestBackgroundPermission,
  checkPermissions,
  startBackgroundTracking,
  stopBackgroundTracking,
  getCurrentLocation,
} from "../../src/services/location";
import { updateDriverLocation, markDriverOffline } from "../../src/services/tracking";
import { timeAgo } from "@nexus/shared";

export default function HomeScreen() {
  const { userDoc } = useAuthStore();
  const {
    isOnline,
    lastSync,
    permissionStatus,
    pendingSync,
    isNetworkConnected,
    setOnline,
    setIdentity,
    setPermissionStatus,
  } = useTrackingStore();

  // Sync identity to tracking store when user doc changes
  useEffect(() => {
    if (userDoc) {
      setIdentity(userDoc.companyId, userDoc.id);
    }
  }, [userDoc, setIdentity]);

  // Check permissions on mount
  useEffect(() => {
    checkPermissions().then(({ foreground, background }) => {
      if (background) setPermissionStatus("background");
      else if (foreground) setPermissionStatus("foreground");
      else setPermissionStatus("denied");
    });
  }, [setPermissionStatus]);

  const handleToggle = useCallback(
    async (value: boolean) => {
      if (!userDoc?.companyId) {
        Alert.alert(
          "No Company",
          "You need to accept a tracking request from a dispatcher first."
        );
        return;
      }

      if (value) {
        // Going online — request permissions
        const hasFg = await requestForegroundPermission();
        if (!hasFg) {
          Alert.alert(
            "Permission Required",
            "Location permission is needed to share your position with your dispatcher.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          return;
        }
        setPermissionStatus("foreground");

        const hasBg = await requestBackgroundPermission();
        if (!hasBg) {
          Alert.alert(
            "Allow All the Time",
            'To keep tracking active when the app is minimized, go to Settings and select "Allow all the time" for location access.',
            [
              { text: "Later" },
              {
                text: "Open Settings",
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          // Still allow foreground-only tracking
        } else {
          setPermissionStatus("background");
        }

        // Start tracking
        const started = await startBackgroundTracking();
        if (!started) {
          Alert.alert("Error", "Failed to start location tracking.");
          return;
        }
        setOnline(true);
        // Send initial location immediately (non-critical — background task handles next update)
        try {
          const loc = await getCurrentLocation();
          if (loc) await updateDriverLocation(loc);
        } catch {
          // Silently ignore — background task will send next update
        }
      } else {
        // Going offline
        setOnline(false);
        await stopBackgroundTracking();
        await markDriverOffline();
      }
    },
    [userDoc, setOnline, setPermissionStatus]
  );

  const hasCompany = !!userDoc?.companyId;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.greeting}>
        Hello, {userDoc?.displayName ?? "Driver"}
      </Text>

      {hasCompany ? (
        <Text style={styles.companyStatus}>Connected to company</Text>
      ) : (
        <Text style={styles.noCompany}>
          No company linked yet. Ask your dispatcher to send you a tracking
          request link.
        </Text>
      )}

      {/* Online/Offline Toggle */}
      <View style={[styles.statusCard, isOnline && styles.statusCardOnline]}>
        <View style={styles.toggleRow}>
          <View>
            <Text style={[styles.status, isOnline && styles.statusOnline]}>
              {isOnline ? "Online" : "Offline"}
            </Text>
            <Text style={styles.statusHint}>
              {isOnline
                ? "Sharing location with dispatcher"
                : hasCompany
                  ? "Tap to start sharing location"
                  : "Link to a company first"}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggle}
            disabled={!hasCompany}
            trackColor={{ false: "#e5e7eb", true: "#86efac" }}
            thumbColor={isOnline ? "#22c55e" : "#999"}
            ios_backgroundColor="#e5e7eb"
          />
        </View>
      </View>

      {/* Status Info Cards */}
      {isOnline && lastSync && (
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Last Sync</Text>
            <Text style={styles.infoValue}>
              {timeAgo(lastSync.timestamp)}
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Battery</Text>
            <Text style={styles.infoValue}>
              {Math.round(lastSync.batteryLevel * 100)}%
              {lastSync.isCharging ? " ⚡" : ""}
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Speed</Text>
            <Text style={styles.infoValue}>
              {lastSync.speed > 0
                ? `${Math.round(lastSync.speed * 3.6)} km/h`
                : "Stationary"}
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>
              {lastSync.lat.toFixed(4)}, {lastSync.lng.toFixed(4)}
            </Text>
          </View>
        </View>
      )}

      {/* Offline Sync Indicator */}
      {pendingSync > 0 && (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>
            {pendingSync} update{pendingSync > 1 ? "s" : ""} pending
          </Text>
          <Text style={styles.warningText}>
            {isNetworkConnected
              ? "Syncing queued location updates..."
              : "No internet connection. Updates will sync when back online."}
          </Text>
        </View>
      )}

      {/* Permission Warning — only foreground granted */}
      {isOnline && permissionStatus === "foreground" && (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Action required</Text>
          <Text style={styles.warningText}>
            Location tracking will stop when the app is minimized. Open Settings
            and change location access to "Allow all the time".
          </Text>
          <TouchableOpacity style={styles.fixButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.fixButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}
      </ScrollView>
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
    marginBottom: 24,
  },
  noCompany: {
    fontSize: 14,
    color: "#f59e0b",
    marginBottom: 24,
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 16,
  },
  statusCardOnline: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  status: {
    fontSize: 28,
    fontWeight: "700",
    color: "#999",
    marginBottom: 2,
  },
  statusOnline: {
    color: "#16a34a",
  },
  statusHint: {
    fontSize: 13,
    color: "#6b7280",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  infoLabel: {
    fontSize: 11,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  warningCard: {
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400e",
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: "#a16207",
    lineHeight: 18,
  },
  fixButton: {
    marginTop: 10,
    backgroundColor: "#92400e",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  fixButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
