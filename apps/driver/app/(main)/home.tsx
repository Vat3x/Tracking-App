import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Linking,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
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
import { subscribeToDriverTrips } from "../../src/services/trips";
import { MAP_STYLE } from "../../src/constants/mapStyle";
import { timeAgo } from "@nexus/shared";
import type { Trip } from "@nexus/shared";

export default function HomeScreen() {
  const { userDoc, firebaseUser } = useAuthStore();
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

  const mapRef = useRef<MapView>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);

  // Sync identity to tracking store when user doc changes
  useEffect(() => {
    if (userDoc) {
      setIdentity(userDoc.companyId, userDoc.id);
    }
  }, [userDoc, setIdentity]);

  // Subscribe to driver trips (for stats)
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    return subscribeToDriverTrips(firebaseUser.uid, setTrips);
  }, [firebaseUser?.uid]);

  // Set initial map region from current location
  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => {
        setInitialRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      })
      .catch(() => {
        setInitialRegion({
          latitude: 39.8283,
          longitude: -98.5795,
          latitudeDelta: 30,
          longitudeDelta: 30,
        });
      });
  }, []);

  // Reverse geocode last sync location to show city/state/zip
  useEffect(() => {
    if (!lastSync) return;
    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: lastSync.lat, longitude: lastSync.lng })
      .then((results) => {
        if (cancelled || !results[0]) return;
        const r = results[0];
        const parts = [r.city, r.region, r.postalCode].filter(Boolean);
        setLocationLabel(parts.length > 0 ? parts.join(", ") : null);
      })
      .catch(() => setLocationLabel(null));
    return () => { cancelled = true; };
  }, [lastSync?.lat, lastSync?.lng]);

  // Animate map to driver location when it changes
  useEffect(() => {
    if (!lastSync || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: lastSync.lat,
      longitude: lastSync.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 1000);
  }, [lastSync?.lat, lastSync?.lng]);

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
        const hasFg = await requestForegroundPermission();
        if (!hasFg) {
          Alert.alert(
            "Permission Required",
            "Location permission is needed to share your position with your dispatcher.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
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
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          setPermissionStatus("background");
        }

        const started = await startBackgroundTracking();
        if (!started) {
          Alert.alert("Error", "Failed to start location tracking.");
          return;
        }
        setOnline(true);
        try {
          const loc = await getCurrentLocation();
          if (loc) await updateDriverLocation(loc);
        } catch {
          // background task will handle next update
        }
      } else {
        setOnline(false);
        await stopBackgroundTracking();
        await markDriverOffline();
      }
    },
    [userDoc, setOnline, setPermissionStatus]
  );

  const hasCompany = !!userDoc?.companyId;

  // Trip stats
  const completedTrips = trips.filter((t) => t.status === "completed").length;
  const activeTrip = trips.find((t) => t.status === "accepted" || t.status === "in_progress") ?? null;
  const pendingTrips = trips.filter((t) => t.status === "pending").length;

  return (
    <View style={styles.container}>
      {/* MAP (~40%) */}
      <View style={styles.mapContainer}>
        {initialRegion ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton
            showsTraffic
            customMapStyle={MAP_STYLE}
          >
            {lastSync && (
              <Marker
                coordinate={{ latitude: lastSync.lat, longitude: lastSync.lng }}
                title="Your Location"
                description={locationLabel ?? undefined}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color="#1a73e8" />
          </View>
        )}

        {/* Greeting overlay */}
        <View style={styles.greetingOverlay}>
          <Text style={styles.greetingText}>
            Hello, {userDoc?.displayName ?? "Driver"}
          </Text>
          {hasCompany && (
            <Text style={styles.connectedText}>Connected</Text>
          )}
          {!hasCompany && (
            <Text style={styles.notConnectedText}>No company linked</Text>
          )}
        </View>
      </View>

      {/* BOTTOM PANEL (~60%) */}
      <ScrollView style={styles.bottomPanel} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Online/Offline Toggle */}
        <View style={[styles.statusRow, isOnline && styles.statusRowOnline]}>
          <View>
            <Text style={[styles.statusLabel, isOnline && { color: "#16a34a" }]}>
              {isOnline ? "Online" : "Offline"}
            </Text>
            <Text style={styles.statusHint}>
              {isOnline
                ? "Sharing location"
                : hasCompany
                  ? "Tap to go online"
                  : "Link to company first"}
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

        {/* Compact info row */}
        {isOnline && lastSync && (
          <View style={styles.compactInfoRow}>
            <View style={styles.compactInfoItem}>
              <Text style={styles.compactLabel}>Sync</Text>
              <Text style={styles.compactValue}>{timeAgo(lastSync.timestamp)}</Text>
            </View>
            <View style={styles.compactInfoItem}>
              <Text style={styles.compactLabel}>Battery</Text>
              <Text style={styles.compactValue}>
                {Math.round(lastSync.batteryLevel * 100)}%
                {lastSync.isCharging ? " \u26A1" : ""}
              </Text>
            </View>
            <View style={styles.compactInfoItem}>
              <Text style={styles.compactLabel}>Speed</Text>
              <Text style={styles.compactValue}>
                {lastSync.speed > 0 ? `${Math.round(lastSync.speed * 3.6)} km/h` : "Still"}
              </Text>
            </View>
          </View>
        )}

        {/* Location */}
        {isOnline && locationLabel && (
          <View style={styles.locationCard}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationText}>{locationLabel}</Text>
          </View>
        )}

        {/* Trip Stats */}
        {hasCompany && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{completedTrips}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, activeTrip ? { color: "#3b82f6" } : {}]}>
                {activeTrip ? "1" : "0"}
              </Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, pendingTrips > 0 ? { color: "#f59e0b" } : {}]}>
                {pendingTrips}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>
        )}

        {/* Active trip indicator */}
        {activeTrip && (
          <View style={styles.activeTripCard}>
            <View style={styles.activeTripHeader}>
              <View style={[styles.activeTripBadge, activeTrip.status === "accepted" ? styles.badgeAccepted : styles.badgeInProgress]}>
                <Text style={styles.activeTripBadgeText}>
                  {activeTrip.status === "accepted" ? "ACCEPTED" : "IN PROGRESS"}
                </Text>
              </View>
            </View>
            <Text style={styles.activeTripLabel}>
              {activeTrip.origin?.label ?? "Pickup"}
              {activeTrip.destination ? ` → ${activeTrip.destination.label ?? "Drop-off"}` : ""}
            </Text>
            <Text style={styles.activeTripHint}>Open Trips tab to manage</Text>
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
                : "No internet. Will sync when back online."}
            </Text>
          </View>
        )}

        {/* Permission Warning */}
        {isOnline && permissionStatus === "foreground" && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Action required</Text>
            <Text style={styles.warningText}>
              Tracking stops when minimized. Enable "Allow all the time" in Settings.
            </Text>
            <TouchableOpacity style={styles.fixButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.fixButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {!hasCompany && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>No company linked</Text>
            <Text style={styles.warningText}>
              Ask your dispatcher to send you a tracking request link.
            </Text>
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
  },
  mapContainer: {
    flex: 1.5,
  },
  mapLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  greetingOverlay: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  greetingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  connectedText: {
    fontSize: 12,
    color: "#22c55e",
    fontWeight: "500",
  },
  notConnectedText: {
    fontSize: 12,
    color: "#f59e0b",
    fontWeight: "500",
  },

  // Bottom panel
  bottomPanel: {
    flex: 8.5,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  statusRowOnline: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#999",
    marginBottom: 2,
  },
  statusHint: {
    fontSize: 12,
    color: "#6b7280",
  },
  compactInfoRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  compactInfoItem: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  compactLabel: {
    fontSize: 10,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  compactValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
    marginTop: 2,
  },

  // Location card
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    marginBottom: 10,
    gap: 8,
  },
  locationIcon: {
    fontSize: 14,
  },
  locationText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    flex: 1,
  },

  // Trip stats
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  statLabel: {
    fontSize: 10,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#e5e7eb",
  },

  // Active trip card
  activeTripCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 10,
  },
  activeTripHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  activeTripBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeAccepted: {
    backgroundColor: "#dbeafe",
  },
  badgeInProgress: {
    backgroundColor: "#e0e7ff",
  },
  activeTripBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#3730a3",
  },
  activeTripLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 4,
  },
  activeTripHint: {
    fontSize: 11,
    color: "#6b7280",
  },

  // Warning cards
  warningCard: {
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    marginBottom: 10,
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
    marginTop: 8,
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
