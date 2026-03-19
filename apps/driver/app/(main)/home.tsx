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
import { useTheme } from "../../src/hooks/useTheme";
import { timeAgo } from "@nexus/shared";
import { type Trip, getTripRouteLabel } from "@nexus/shared";
import { Logo } from "../../src/components/Logo";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../src/services/firebase";
import { COLLECTIONS } from "@nexus/shared";

export default function HomeScreen() {
  const { userDoc, firebaseUser } = useAuthStore();
  const { colors, isDark, mapStyle } = useTheme();
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
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Sync identity to tracking store when user doc changes
  useEffect(() => {
    if (userDoc) {
      setIdentity(userDoc.companyId, userDoc.id);
    }
  }, [userDoc, setIdentity]);

  // Fetch company name
  useEffect(() => {
    if (!userDoc?.companyId) return;
    getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
      if (snap.exists()) setCompanyName(snap.data().name ?? null);
    });
  }, [userDoc?.companyId]);

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
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
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
            customMapStyle={mapStyle}
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
          <View style={[styles.mapLoading, { backgroundColor: colors.bgSecondary }]}>
            <ActivityIndicator size="large" color="#1a73e8" />
          </View>
        )}

        {/* Greeting overlay */}
        <View style={[styles.greetingOverlay, { backgroundColor: colors.bgOverlay }]}>
          <View style={styles.greetingRow}>
            <Logo size={18} />
            <Text style={[styles.greetingText, { color: colors.text }]}>
              {userDoc?.displayName ?? "Driver"}
            </Text>
            {hasCompany && (
              <View style={styles.connectedDot} />
            )}
          </View>
          {userDoc?.companyName && (
            <Text style={[styles.companyText, { color: colors.textSecondary }]}>
              {userDoc.companyName}
            </Text>
          )}
        </View>
      </View>

      {/* BOTTOM PANEL (~60%) */}
      <ScrollView style={styles.bottomPanel} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Online/Offline Toggle */}
        <View style={[
          styles.statusRow,
          { backgroundColor: colors.statusRowBg, borderColor: colors.statusRowBorder },
          isOnline && { backgroundColor: colors.onlineRowBg, borderColor: colors.onlineRowBorder },
        ]}>
          <View>
            <Text style={[styles.statusLabel, { color: colors.textMuted }, isOnline && { color: "#16a34a" }]}>
              {isOnline ? "Online" : "Offline"}
            </Text>
            <Text style={[styles.statusHint, { color: colors.textSecondary }]}>
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
            trackColor={{ false: isDark ? "#333" : "#e5e7eb", true: "#86efac" }}
            thumbColor={isOnline ? "#22c55e" : isDark ? "#666" : "#999"}
            ios_backgroundColor={isDark ? "#333" : "#e5e7eb"}
          />
        </View>

        {/* Compact info row */}
        {isOnline && lastSync && (
          <View style={styles.compactInfoRow}>
            <View style={[styles.compactInfoItem, { backgroundColor: colors.statusRowBg, borderColor: colors.borderLight }]}>
              <Text style={[styles.compactLabel, { color: colors.textMuted }]}>Sync</Text>
              <Text style={[styles.compactValue, { color: colors.text }]}>{timeAgo(lastSync.timestamp)}</Text>
            </View>
            <View style={[styles.compactInfoItem, { backgroundColor: colors.statusRowBg, borderColor: colors.borderLight }]}>
              <Text style={[styles.compactLabel, { color: colors.textMuted }]}>Battery</Text>
              <Text style={[styles.compactValue, { color: colors.text }]}>
                {Math.round(lastSync.batteryLevel * 100)}%
                {lastSync.isCharging ? " \u26A1" : ""}
              </Text>
            </View>
            <View style={[styles.compactInfoItem, { backgroundColor: colors.statusRowBg, borderColor: colors.borderLight }]}>
              <Text style={[styles.compactLabel, { color: colors.textMuted }]}>Speed</Text>
              <Text style={[styles.compactValue, { color: colors.text }]}>
                {lastSync.speed > 0 ? `${Math.round(lastSync.speed * 3.6)} km/h` : "Still"}
              </Text>
            </View>
          </View>
        )}

        {/* Location */}
        {isOnline && locationLabel && (
          <View style={[styles.locationCard, { backgroundColor: colors.statusRowBg, borderColor: colors.borderLight }]}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={[styles.locationText, { color: colors.textSecondary }]}>{locationLabel}</Text>
          </View>
        )}

        {/* Company */}
        {companyName && (
          <View style={[styles.locationCard, { backgroundColor: colors.statusRowBg, borderColor: colors.borderLight }]}>
            <Text style={{ fontSize: 14, color: colors.textMuted }}>🏢</Text>
            <Text style={[styles.locationText, { color: colors.textSecondary }]}>{companyName}</Text>
          </View>
        )}

        {/* Trip Stats */}
        {hasCompany && (
          <View style={[styles.statsRow, { backgroundColor: colors.statusRowBg, borderColor: colors.borderLight }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{completedTrips}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Completed</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: activeTrip ? "#3b82f6" : colors.text }]}>
                {activeTrip ? "1" : "0"}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Active</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: pendingTrips > 0 ? "#f59e0b" : colors.text }]}>
                {pendingTrips}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Pending</Text>
            </View>
          </View>
        )}

        {/* Active trip indicator */}
        {activeTrip && (
          <View style={[styles.activeTripCard, { backgroundColor: colors.activeTripBg, borderColor: colors.activeTripBorder }]}>
            <View style={styles.activeTripHeader}>
              <View style={[styles.activeTripBadge, { backgroundColor: activeTrip.status === "accepted" ? (isDark ? "#1e3a5f" : "#dbeafe") : (isDark ? "#312e81" : "#e0e7ff") }]}>
                <Text style={[styles.activeTripBadgeText, { color: isDark ? "#c7d2fe" : "#3730a3" }]}>
                  {activeTrip.status === "accepted" ? "ACCEPTED" : "IN PROGRESS"}
                </Text>
              </View>
            </View>
            <Text style={[styles.activeTripLabel, { color: isDark ? "#93c5fd" : "#1e40af" }]}>
              {getTripRouteLabel(activeTrip)}
            </Text>
            <Text style={[styles.activeTripHint, { color: colors.textSecondary }]}>Open Trips tab to manage</Text>
          </View>
        )}

        {/* Offline Sync Indicator */}
        {pendingSync > 0 && (
          <View style={[styles.warningCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Text style={[styles.warningTitle, { color: colors.warningTitle }]}>
              {pendingSync} update{pendingSync > 1 ? "s" : ""} pending
            </Text>
            <Text style={[styles.warningText, { color: colors.warningText }]}>
              {isNetworkConnected
                ? "Syncing queued location updates..."
                : "No internet. Will sync when back online."}
            </Text>
          </View>
        )}

        {/* Permission Warning */}
        {isOnline && permissionStatus === "foreground" && (
          <View style={[styles.warningCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Text style={[styles.warningTitle, { color: colors.warningTitle }]}>Action required</Text>
            <Text style={[styles.warningText, { color: colors.warningText }]}>
              Tracking stops when minimized. Enable "Allow all the time" in Settings.
            </Text>
            <TouchableOpacity style={styles.fixButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.fixButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {!hasCompany && (
          <View style={[styles.warningCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Text style={[styles.warningTitle, { color: colors.warningTitle }]}>No company linked</Text>
            <Text style={[styles.warningText, { color: colors.warningText }]}>
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
  },
  mapContainer: {
    height: 230,
  },
  mapLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  greetingOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  greetingText: {
    fontSize: 13,
    fontWeight: "600",
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  companyText: {
    fontSize: 11,
    marginTop: 2,
  },

  // Bottom panel
  bottomPanel: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  statusHint: {
    fontSize: 12,
  },
  compactInfoRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  compactInfoItem: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  compactLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  compactValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },

  // Location card
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    marginBottom: 10,
    gap: 8,
  },
  locationIcon: {
    fontSize: 14,
  },
  locationText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },

  // Trip stats
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
  },

  // Active trip card
  activeTripCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
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
  activeTripBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  activeTripLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  activeTripHint: {
    fontSize: 11,
  },

  // Warning cards
  warningCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
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
