import { useState, useEffect, useRef, Component, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../src/stores/auth";
import { useTrackingStore } from "../../src/stores/tracking";
import { useTripsStore } from "../../src/stores/trips";
import { respondToTrip, advanceToNextStop } from "../../src/services/trips";
import { fetchRoute, type RouteResult } from "../../src/services/routing";
import { useTheme } from "../../src/hooks/useTheme";
import { getStatusColors } from "../../src/constants/statusColors";
import { type Trip, type TripStatus, getStopsFromTrip } from "@nexus/shared";
import TripMap from "../../src/components/TripMap";
import { DirectionArrow } from "../../src/components/DirectionArrow";

// Error boundary
class TripsErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  state = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, errorMsg: err?.message ?? "Unknown error" };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#ef4444", marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 13, color: "#9ca3af", textAlign: "center" }}>
            {this.state.errorMsg}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const STATUS_LABELS: Record<TripStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatETA(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `~${hrs} hr ${rem} min` : `~${hrs} hr`;
}

function formatDistance(meters: number, useMiles: boolean): string {
  if (useMiles) {
    const miles = meters / 1609.344;
    return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function handleNavigateExternal(trip: Trip, stopIndex?: number) {
  const stops = getStopsFromTrip(trip);
  const currentIdx = trip.currentStopIndex ?? 0;
  let target: { lat: number; lng: number; label?: string } | undefined;
  if (stopIndex != null && stopIndex < stops.length) {
    target = stops[stopIndex];
  } else if (trip.status === "accepted") {
    target = stops[0]; // first pickup
  } else if (currentIdx < stops.length) {
    target = stops[currentIdx];
  } else {
    target = stops[stops.length - 1]; // last stop
  }
  if (!target) return;
  const { lat, lng, label } = target;
  // Use address label if available, fall back to coordinates
  const destination = label ? encodeURIComponent(label) : `${lat},${lng}`;
  const googleUrl = Platform.OS === "android"
    ? `google.navigation:q=${destination}`
    : `comgooglemaps://?daddr=${destination}&directionsmode=driving`;
  const fallback = Platform.OS === "ios"
    ? `maps:?daddr=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  Linking.openURL(googleUrl).catch(() => Linking.openURL(fallback));
}

// ── Full-screen navigation view for active trip ──
function ActiveTripNavView({
  trip,
  onRespond,
  onAdvanceStop,
  onShowList,
}: {
  trip: Trip;
  onRespond: (tripId: string, status: TripStatus, extraFields?: Record<string, unknown>) => void;
  onAdvanceStop: (tripId: string, nextIndex: number) => void;
  onShowList: () => void;
}) {
  const { colors, isDark, mapStyle } = useTheme();
  const lastSync = useTrackingStore((s) => s.lastSync);
  const mapRef = useRef<MapView>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number; heading: number } | null>(null);

  const isAccepted = trip.status === "accepted";
  const isInProgress = trip.status === "in_progress";
  const stops = getStopsFromTrip(trip);
  const currentIdx = trip.currentStopIndex ?? 0;
  const allStopsCompleted = currentIdx >= stops.length;
  const useMiles = trip.country === "us";

  // Live GPS tracking for arrow position + heading
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
        (loc) => {
          setDriverPos({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            heading: loc.coords.heading ?? 0,
          });
        },
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // Auto-clear selection when currentStopIndex changes
  useEffect(() => {
    setSelectedStopIndex(null);
  }, [trip.currentStopIndex]);

  // Set initial region
  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => {
        setInitialRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      })
      .catch(() => {
        const first = stops[0];
        setInitialRegion({
          latitude: first?.lat ?? 39.83,
          longitude: first?.lng ?? -98.58,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        });
      });
  }, []);

  // Fetch route
  const [straightLineCoords, setStraightLineCoords] = useState<{ latitude: number; longitude: number }[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoute() {
      setRouteLoading(true);
      try {
        let driverCoord: [number, number] | null = null;
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === "granted" && !cancelled) {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (!cancelled) {
              driverCoord = [loc.coords.longitude, loc.coords.latitude];
              setDriverPos({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                heading: loc.coords.heading ?? 0,
              });
            }
          }
        } catch (e) {
          console.log("Could not get driver location for route:", e);
        }

        if (cancelled) return;

        let waypoints: [number, number][] = [];

        // If a specific stop is selected, route driver → that stop only
        if (selectedStopIndex != null && selectedStopIndex < stops.length) {
          if (driverCoord) waypoints.push(driverCoord);
          waypoints.push([stops[selectedStopIndex].lng, stops[selectedStopIndex].lat]);
        } else if (isAccepted) {
          if (driverCoord) waypoints.push(driverCoord);
          stops.forEach((s) => waypoints.push([s.lng, s.lat]));
        } else {
          if (driverCoord) waypoints.push(driverCoord);
          stops.slice(currentIdx).forEach((s) => waypoints.push([s.lng, s.lat]));
        }

        const straightLine = waypoints.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
        if (!cancelled) setStraightLineCoords(straightLine);

        if (waypoints.length < 2) {
          if (!cancelled) setRouteLoading(false);
          return;
        }

        const result = await fetchRoute(waypoints);
        if (!cancelled) {
          setRoute(result);
          const fitCoords = result
            ? result.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
            : straightLine;
          if (fitCoords.length >= 2 && mapRef.current) {
            setTimeout(() => {
              mapRef.current?.fitToCoordinates(fitCoords, {
                edgePadding: { top: 80, right: 40, bottom: 250, left: 40 },
                animated: true,
              });
            }, 500);
          }
        }
      } catch (e) {
        console.error("Route fetch failed:", e);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }

    loadRoute();
    return () => { cancelled = true; };
  }, [trip.id, trip.status, trip.currentStopIndex, selectedStopIndex]);

  const routeCoords = route?.coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  })) ?? [];

  function getNextTargetLabel(): string {
    if (selectedStopIndex != null && selectedStopIndex < stops.length) {
      const s = stops[selectedStopIndex];
      return `${s.type === "pickup" ? "Pickup" : "Drop-off"}: ${s.label ?? "Unknown"}`;
    }
    if (isAccepted) return stops[0]?.label ?? "Pickup";
    if (isInProgress && currentIdx < stops.length) {
      const stop = stops[currentIdx];
      return `${stop.type === "pickup" ? "Pickup" : "Drop-off"}: ${stop?.label ?? "Unknown"}`;
    }
    return stops[stops.length - 1]?.label ?? "Destination";
  }

  function getNextTargetType(): string {
    if (selectedStopIndex != null && selectedStopIndex < stops.length) {
      const s = stops[selectedStopIndex];
      return `Selected: ${s.type === "pickup" ? "Pickup" : "Drop-off"} ${selectedStopIndex + 1}`;
    }
    if (isAccepted) return "Next: Pickup";
    if (isInProgress && currentIdx < stops.length) {
      const stop = stops[currentIdx];
      return `Next: ${stop.type === "pickup" ? "Pickup" : "Drop-off"} ${currentIdx + 1}`;
    }
    return "Next: Final Stop";
  }

  function getNextStopNote(): string | undefined {
    if (selectedStopIndex != null && selectedStopIndex < stops.length) return stops[selectedStopIndex]?.note;
    if (isAccepted) return stops[0]?.note;
    if (isInProgress && currentIdx < stops.length) return stops[currentIdx]?.note;
    return undefined;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* FULL-SCREEN MAP */}
      {initialRegion ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={initialRegion}
          showsUserLocation={!lastSync && !driverPos}
          showsMyLocationButton={false}
          showsTraffic
          customMapStyle={mapStyle}
        >
          {routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={selectedStopIndex != null ? "#f97316" : "#3b82f6"}
              strokeWidth={5}
              lineDashPattern={isAccepted && selectedStopIndex == null ? [10, 5] : undefined}
            />
          )}
          {routeCoords.length <= 1 && straightLineCoords.length > 1 && (
            <Polyline
              coordinates={straightLineCoords}
              strokeColor={selectedStopIndex != null ? "#f97316" : "#3b82f6"}
              strokeWidth={4}
              lineDashPattern={[10, 8]}
            />
          )}
          {stops.map((stop, i) => {
            // Only show the active destination: selected stop, current stop, or first pickup
            const targetIdx = selectedStopIndex ?? (isInProgress ? currentIdx : 0);
            if (i !== targetIdx) return null;
            const color = stop.type === "pickup" ? "#22c55e" : "#ef4444";
            return (
              <Marker
                key={`stop-${i}`}
                coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                pinColor={selectedStopIndex != null ? "#f97316" : color}
                title={`${stop.type === "pickup" ? "Pickup" : "Drop-off"} ${i + 1}`}
                description={stop.label}
              />
            );
          })}
          {(driverPos || lastSync) && (
            <Marker
              coordinate={{
                latitude: (driverPos ?? lastSync)!.lat,
                longitude: (driverPos ?? lastSync)!.lng,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              tracksViewChanges
            >
              <DirectionArrow heading={(driverPos ?? lastSync)!.heading} />
            </Marker>
          )}
        </MapView>
      ) : (
        <View style={[styles.mapLoading, { backgroundColor: colors.bgSecondary }]}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      )}

      {/* TOP OVERLAY */}
      <View style={styles.topOverlay}>
        <View style={[styles.navStatusOverlay, { backgroundColor: colors.bgOverlayStrong }]}>
          <View style={[styles.navBadge, { backgroundColor: isAccepted ? (isDark ? "#1e3a5f" : "#dbeafe") : (isDark ? "#312e81" : "#e0e7ff") }]}>
            <Text style={[styles.navBadgeText, { color: isDark ? "#c7d2fe" : "#3730a3" }]}>
              {isAccepted ? "ACCEPTED" : "IN PROGRESS"}
            </Text>
          </View>
          <Text style={[styles.navStatusTarget, { color: colors.text }]} numberOfLines={1}>
            {getNextTargetLabel()}
          </Text>
          {trip.freeDropoff && (
            <View style={[styles.freeDropoffBadge, { backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" }]}>
              <Text style={[styles.freeDropoffBadgeText, { color: isDark ? "#93c5fd" : "#1d4ed8" }]}>Any order</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={[styles.backToListBtn, { backgroundColor: colors.bgOverlayStrong }]} onPress={onShowList}>
          <Text style={[styles.backToListText, { color: isDark ? "#fff" : "#3b82f6" }]}>All Trips</Text>
        </TouchableOpacity>
      </View>

      {routeLoading && (
        <View style={[styles.routeLoadingOverlay, { backgroundColor: colors.bgOverlay }]}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={[styles.routeLoadingText, { color: colors.textSecondary }]}>Loading route...</Text>
        </View>
      )}

      {/* BOTTOM OVERLAY */}
      <View style={styles.bottomOverlay}>
        {route && (
          <View style={[styles.navInfoCard, { backgroundColor: colors.bgOverlayStrong }]}>
            <View style={styles.navInfoItem}>
              <Text style={[styles.navInfoValue, { color: colors.text }]}>{formatETA(route.duration)}</Text>
              <Text style={[styles.navInfoLabel, { color: colors.textSecondary }]}>ETA</Text>
            </View>
            <View style={[styles.navInfoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.navInfoItem}>
              <Text style={[styles.navInfoValue, { color: colors.text }]}>{formatDistance(route.distance, useMiles)}</Text>
              <Text style={[styles.navInfoLabel, { color: colors.textSecondary }]}>Distance</Text>
            </View>
            {stops.length > 0 && (
              <>
                <View style={[styles.navInfoDivider, { backgroundColor: colors.border }]} />
                <View style={styles.navInfoItem}>
                  <Text style={[styles.navInfoValue, { color: colors.text }]}>{Math.min(currentIdx, stops.length)}/{stops.length}</Text>
                  <Text style={[styles.navInfoLabel, { color: colors.textSecondary }]}>Stops</Text>
                </View>
              </>
            )}
          </View>
        )}

        <View style={[styles.nextTargetRow, { backgroundColor: colors.bgOverlayStrong }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.navTargetType, { color: colors.textSecondary }]}>{getNextTargetType()}</Text>
            <Text style={[styles.navTargetName, { color: colors.text }]} numberOfLines={1}>{getNextTargetLabel()}</Text>
            {getNextStopNote() && (
              <View style={[styles.navNoteContainer, { backgroundColor: isDark ? "#1e293b" : "#fef9c3", borderColor: isDark ? "#334155" : "#fde68a" }]}>
                <Text style={[styles.navNoteText, { color: isDark ? "#fcd34d" : "#92400e" }]}>
                  {getNextStopNote()}
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {selectedStopIndex != null && (
              <TouchableOpacity
                style={[styles.gmapsBtn, { backgroundColor: isDark ? colors.bgCard : "#fff", borderColor: "#9ca3af" }]}
                onPress={() => setSelectedStopIndex(null)}
              >
                <Text style={[styles.gmapsBtnText, { color: "#6b7280" }]}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.gmapsBtn, { backgroundColor: isDark ? colors.bgCard : "#fff" }]}
              onPress={() => handleNavigateExternal(trip, selectedStopIndex ?? undefined)}
            >
              <Text style={styles.gmapsBtnText}>Google Maps</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isAccepted && (
          <TouchableOpacity
            style={[styles.navActionBtn, { backgroundColor: "#3b82f6" }]}
            onPress={() => onRespond(trip.id, "in_progress", { currentStopIndex: 0 })}
          >
            <Text style={styles.navActionBtnText}>Start Trip</Text>
          </TouchableOpacity>
        )}
        {isInProgress && !allStopsCompleted && stops.length > 0 && (
          <TouchableOpacity
            style={[styles.navActionBtn, { backgroundColor: "#f97316" }]}
            onPress={() => onAdvanceStop(trip.id, currentIdx + 1)}
          >
            <Text style={styles.navActionBtnText}>Arrived at Stop {currentIdx + 1}</Text>
          </TouchableOpacity>
        )}
        {isInProgress && (allStopsCompleted || stops.length === 0) && (
          <TouchableOpacity
            style={[styles.navActionBtn, { backgroundColor: "#16a34a" }]}
            onPress={() => onRespond(trip.id, "completed")}
          >
            <Text style={styles.navActionBtnText}>Complete Trip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Trip card for list view ──
function TripCard({
  trip,
  onRespond,
  onAdvanceStop,
  onShowDirections,
}: {
  trip: Trip;
  onRespond: (tripId: string, status: TripStatus, extraFields?: Record<string, unknown>) => void;
  onAdvanceStop: (tripId: string, nextIndex: number) => void;
  onShowDirections?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const statusColors = getStatusColors(isDark);
  const statusColor = statusColors[trip.status];
  const stops = getStopsFromTrip(trip);
  const currentIdx = trip.currentStopIndex ?? 0;
  const isInProgress = trip.status === "in_progress";
  const isActive = trip.status === "accepted" || isInProgress;
  const hasStops = stops.length > 0;
  const allStopsCompleted = currentIdx >= stops.length;
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);

  // Auto-clear selection when currentStopIndex changes
  useEffect(() => {
    setSelectedStopIndex(null);
  }, [trip.currentStopIndex]);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderLight }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.badgeText, { color: statusColor.text }]}>
            {STATUS_LABELS[trip.status]}
          </Text>
        </View>
        <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(trip.createdAt)}</Text>
      </View>

      <View style={styles.route}>
        {stops.map((stop, i) => {
          const isCompleted = isInProgress && i < currentIdx;
          const isCurrent = isInProgress && i === currentIdx;
          const isPickup = stop.type === "pickup";
          const isSelected = selectedStopIndex === i;
          const dotColor = isCompleted ? "#22c55e" : isCurrent ? "#3b82f6" : isPickup ? "#22c55e" : "#ef4444";

          const stopContent = (
            <View key={i}>
              {i > 0 && <View style={[styles.routeLine, { backgroundColor: colors.routeLine }]} />}
              <View style={[
                styles.routePoint,
                isSelected && { backgroundColor: isDark ? "#1e293b" : "#eff6ff", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, marginHorizontal: -6 },
              ]}>
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                <View style={styles.routeInfo}>
                  <Text style={[styles.routeLabel, { color: colors.textMuted }]}>
                    {isPickup ? "Pickup" : "Drop-off"}{isCompleted ? " (Done)" : isCurrent ? " (Next)" : ""}
                  </Text>
                  <Text style={[styles.routeName, { color: colors.text }, isCompleted && styles.completedStopText]}>
                    {stop?.label ?? "Unknown"}
                    {stop?.zipCode ? ` (${stop.zipCode})` : ""}
                  </Text>
                  {stop.note && (
                    <View style={[styles.noteContainer, { backgroundColor: isDark ? "#1e293b" : "#fef9c3", borderColor: isDark ? "#334155" : "#fde68a" }]}>
                      <Text style={[styles.noteText, { color: isDark ? "#fcd34d" : "#92400e" }]}>
                        {stop.note}
                      </Text>
                    </View>
                  )}
                </View>
                {isActive && !isCompleted && !isSelected && (
                  <Text style={[styles.tapHint, { color: colors.textMuted }]}>Tap</Text>
                )}
              </View>
            </View>
          );

          if (isActive && !isCompleted) {
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                onPress={() => setSelectedStopIndex(isSelected ? null : i)}
              >
                {stopContent}
              </TouchableOpacity>
            );
          }
          return stopContent;
        })}
      </View>

      {/* Free drop-off indicator */}
      {trip.freeDropoff && (
        <View style={[styles.freeDropoffBanner, { backgroundColor: isDark ? "#1e3a5f" : "#eff6ff", borderColor: isDark ? "#2563eb" : "#93c5fd" }]}>
          <Text style={[styles.freeDropoffText, { color: isDark ? "#93c5fd" : "#1d4ed8" }]}>
            Free drop-off order — deliver in any order
          </Text>
        </View>
      )}

      {/* Inline map — shows route to selected stop or default route */}
      {isActive && (
        <TripMap trip={trip} selectedStopIndex={selectedStopIndex} />
      )}

      {(trip.status === "accepted" || trip.status === "in_progress") && onShowDirections && (
        <TouchableOpacity style={styles.directionsBtn} onPress={onShowDirections}>
          <Text style={styles.directionsBtnText}>Directions</Text>
        </TouchableOpacity>
      )}

      {trip.status === "pending" && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn, isDark && { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
            onPress={() => onRespond(trip.id, "rejected")}
          >
            <Text style={[styles.rejectBtnText, { color: colors.textSecondary }]}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => onRespond(trip.id, "accepted")}
          >
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
        </View>
      )}

      {trip.status === "accepted" && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.startBtn]}
            onPress={() => onRespond(trip.id, "in_progress", { currentStopIndex: 0 })}
          >
            <Text style={styles.startBtnText}>Start Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      {isInProgress && (
        <View style={styles.actions}>
          {hasStops && !allStopsCompleted ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.arrivedBtn]}
              onPress={() => onAdvanceStop(trip.id, currentIdx + 1)}
            >
              <Text style={styles.arrivedBtnText}>
                Arrived at Stop {currentIdx + 1}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.completeBtn]}
              onPress={() => onRespond(trip.id, "completed")}
            >
              <Text style={styles.completeBtnText}>Complete Trip</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function TripsScreenWrapper() {
  return (
    <TripsErrorBoundary>
      <TripsScreen />
    </TripsErrorBoundary>
  );
}

function TripsScreen() {
  const router = useRouter();
  const { userDoc, firebaseUser } = useAuthStore();
  const { colors } = useTheme();
  const trips = useTripsStore((s) => s.trips);
  const loaded = useTripsStore((s) => s.loaded);
  const [refreshing, setRefreshing] = useState(false);
  const [showList, setShowList] = useState(false);

  const initialLoading = !loaded;

  const activeTrips = trips.filter((t) =>
    ["pending", "accepted", "in_progress"].includes(t.status)
  );

  const activeTrip = activeTrips.find(
    (t) => t.status === "accepted" || t.status === "in_progress"
  ) ?? null;

  async function handleRespond(tripId: string, status: TripStatus, extraFields?: Record<string, unknown>) {
    const labels: Record<string, string> = {
      accepted: "accept",
      rejected: "decline",
      in_progress: "start",
      completed: "complete",
    };

    Alert.alert(
      "Confirm",
      `Are you sure you want to ${labels[status]} this trip?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes",
          onPress: async () => {
            try {
              await respondToTrip(tripId, status, extraFields);
              if (status === "accepted") {
                setShowList(false);
              }
            } catch {
              Alert.alert("Error", "Failed to update trip. Try again.");
            }
          },
        },
      ]
    );
  }

  async function handleAdvanceStop(tripId: string, nextIndex: number) {
    Alert.alert(
      "Confirm",
      `Mark Stop ${nextIndex} as reached?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes",
          onPress: async () => {
            try {
              await advanceToNextStop(tripId, nextIndex);
            } catch {
              Alert.alert("Error", "Failed to update stop progress. Try again.");
            }
          },
        },
      ]
    );
  }

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }

  const hasCompany = !!userDoc?.companyId;

  if (!initialLoading && activeTrip && !showList) {
    return (
      <ActiveTripNavView
        trip={activeTrip}
        onRespond={handleRespond}
        onAdvanceStop={handleAdvanceStop}
        onShowList={() => setShowList(true)}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {initialLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      ) : !hasCompany ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Link to a company first to receive trip assignments.
          </Text>
        </View>
      ) : activeTrips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No active trips</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Your dispatcher will assign trips to you. They'll appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeTrips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onRespond={handleRespond}
              onAdvanceStop={handleAdvanceStop}
              onShowDirections={
                item.status === "accepted" || item.status === "in_progress"
                  ? () => setShowList(false)
                  : undefined
              }
            />
          )}
          contentContainerStyle={styles.list}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                Active ({activeTrips.length})
              </Text>
              {activeTrip && (
                <TouchableOpacity onPress={() => setShowList(false)}>
                  <Text style={styles.viewMapLink}>View Map</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  viewMapLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3b82f6",
  },
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  time: {
    fontSize: 11,
  },
  route: {
    marginBottom: 14,
  },
  routePoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeInfo: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeName: {
    fontSize: 14,
    fontWeight: "500",
  },
  completedStopText: {
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  noteContainer: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  noteText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  routeLine: {
    width: 1,
    height: 16,
    marginLeft: 4.5,
    marginVertical: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  acceptBtn: { backgroundColor: "#22c55e" },
  acceptBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rejectBtn: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  rejectBtnText: { fontWeight: "600", fontSize: 14 },
  startBtn: { backgroundColor: "#3b82f6" },
  startBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  arrivedBtn: { backgroundColor: "#f97316" },
  arrivedBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  completeBtn: { backgroundColor: "#16a34a" },
  completeBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  // ── Nav view styles ──
  mapLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  topOverlay: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 8,
  },
  navStatusOverlay: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  navBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeAccepted: { backgroundColor: "#dbeafe" },
  badgeInProgress: { backgroundColor: "#e0e7ff" },
  navBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#3730a3",
  },
  navStatusTarget: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  backToListBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  backToListText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3b82f6",
  },
  routeLoadingOverlay: {
    position: "absolute",
    top: 70,
    alignSelf: "center",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  routeLoadingText: {
    fontSize: 12,
  },
  bottomOverlay: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    gap: 8,
  },
  navInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  navInfoItem: {
    flex: 1,
    alignItems: "center",
  },
  navInfoValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  navInfoLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 1,
  },
  navInfoDivider: {
    width: 1,
    height: 28,
  },
  nextTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  navTargetType: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  navTargetName: {
    fontSize: 14,
    fontWeight: "700",
  },
  gmapsBtn: {
    borderWidth: 1.5,
    borderColor: "#3b82f6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gmapsBtnText: {
    color: "#3b82f6",
    fontWeight: "700",
    fontSize: 12,
  },
  navNoteContainer: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  navNoteText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  navActionBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  navActionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  directionsBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#3b82f6",
    marginBottom: 8,
  },
  directionsBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  tapHint: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  freeDropoffBanner: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  freeDropoffText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  freeDropoffBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  freeDropoffBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
