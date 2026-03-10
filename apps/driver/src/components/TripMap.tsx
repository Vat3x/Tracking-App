import { useState, useEffect, useRef, Component, type ReactNode } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import MapView, { Polyline, Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { fetchRoute, type RouteResult } from "../services/routing";
import { MAP_STYLE } from "../constants/mapStyle";
import type { Trip } from "@nexus/shared";

function formatETA(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `~${hrs} hr ${rem} min` : `~${hrs} hr`;
}

// Error boundary — prevents MapView native crash from killing the whole screen
class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface Props {
  trip: Trip;
}

function TripMapInner({ trip }: Props) {
  const mapRef = useRef<MapView>(null);
  const mountedRef = useRef(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const stops = trip.stops ?? [];
  const currentIdx = trip.currentStopIndex ?? 0;
  const isAccepted = trip.status === "accepted";
  const isInProgress = trip.status === "in_progress";

  useEffect(() => {
    let cancelled = false;

    async function loadRoute() {
      setLoading(true);
      setError(false);

      try {
        let waypoints: [number, number][];

        if (isAccepted) {
          // Accepted: driver → origin → all stops → destination
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== "granted" || cancelled) {
            if (!cancelled) { setError(true); setLoading(false); }
            return;
          }
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
          });
          if (cancelled) return;

          const allStopWaypoints: [number, number][] = stops.map(
            (s) => [s.lng, s.lat] as [number, number]
          );
          waypoints = [
            [loc.coords.longitude, loc.coords.latitude],
            [trip.origin.lng, trip.origin.lat],
            ...allStopWaypoints,
            ...(trip.destination ? [[trip.destination.lng, trip.destination.lat] as [number, number]] : []),
          ];
        } else if (isInProgress) {
          // In progress: driver → remaining stops → destination
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== "granted" || cancelled) {
            if (!cancelled) { setError(true); setLoading(false); }
            return;
          }
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
          });
          if (cancelled) return;

          const remainingStops: [number, number][] = stops.slice(currentIdx).map(
            (s) => [s.lng, s.lat] as [number, number]
          );
          waypoints = [
            [loc.coords.longitude, loc.coords.latitude],
            ...remainingStops,
            ...(trip.destination ? [[trip.destination.lng, trip.destination.lat] as [number, number]] : []),
          ];
        } else {
          // Fallback: origin → all stops → destination
          const allStopWaypoints: [number, number][] = stops.map(
            (s) => [s.lng, s.lat] as [number, number]
          );
          waypoints = [
            [trip.origin.lng, trip.origin.lat],
            ...allStopWaypoints,
            ...(trip.destination ? [[trip.destination.lng, trip.destination.lat] as [number, number]] : []),
          ];
        }

        if (waypoints.length < 2) {
          if (!cancelled) { setError(true); setLoading(false); }
          return;
        }

        const result = await fetchRoute(waypoints);
        if (cancelled) return;

        if (result) {
          setRoute(result);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRoute();
    return () => { cancelled = true; };
  }, [trip.id, trip.status, trip.currentStopIndex]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading route...</Text>
      </View>
    );
  }

  if (error || !route) {
    return null;
  }

  const routeCoords = route.coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));

  const midIdx = Math.floor(routeCoords.length / 2);
  const initialRegion: Region = {
    latitude: routeCoords[midIdx].latitude,
    longitude: routeCoords[midIdx].longitude,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  const handleMapReady = () => {
    try {
      if (mountedRef.current && mapRef.current && routeCoords.length > 1) {
        mapRef.current.fitToCoordinates(routeCoords, {
          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
          animated: false,
        });
      }
    } catch {
      // Silently ignore fit errors
    }
  };

  // ETA label based on next target
  const getEtaLabel = () => {
    if (isAccepted) return "ETA to pickup";
    if (isInProgress && stops.length > 0 && currentIdx < stops.length) {
      return `ETA to Stop ${currentIdx + 1}`;
    }
    return trip.destination ? "ETA to drop-off" : "ETA";
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onMapReady={handleMapReady}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        liteMode={Platform.OS === "android"}
        loadingEnabled
        customMapStyle={MAP_STYLE}
      >
        <Polyline
          coordinates={routeCoords}
          strokeColor={isAccepted ? "#eab308" : "#3b82f6"}
          strokeWidth={4}
          lineDashPattern={isAccepted ? [10, 5] : undefined}
        />

        <Marker
          coordinate={{
            latitude: trip.origin.lat,
            longitude: trip.origin.lng,
          }}
          pinColor="#22c55e"
          title="Pickup"
          description={trip.origin.label}
        />

        {/* Intermediate stop markers — completed stops in green, remaining in orange */}
        {stops.map((stop, i) => {
          const isCompleted = isInProgress && i < currentIdx;
          return (
            <Marker
              key={`stop-${i}`}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              pinColor={isCompleted ? "#22c55e" : "#f97316"}
              title={`Stop ${i + 1}${isCompleted ? " (Done)" : ""}`}
              description={stop.label}
              opacity={isCompleted ? 0.5 : 1}
            />
          );
        })}

        {!isAccepted && trip.destination && (
          <Marker
            coordinate={{
              latitude: trip.destination.lat,
              longitude: trip.destination.lng,
            }}
            pinColor="#ef4444"
            title="Drop-off"
            description={trip.destination.label}
          />
        )}
      </MapView>

      <View style={styles.etaBar}>
        <Text style={styles.etaLabel}>{getEtaLabel()}</Text>
        <Text style={styles.etaValue}>{formatETA(route.duration)}</Text>
      </View>
    </View>
  );
}

// Only render map for the FIRST active trip to avoid multiple MapView instances
export default function TripMap({ trip }: Props) {
  return (
    <MapErrorBoundary>
      <TripMapInner trip={trip} />
    </MapErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  map: {
    height: 180,
    width: "100%",
  },
  loadingContainer: {
    height: 80,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  loadingText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  etaBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f9fafb",
  },
  etaLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  etaValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
  },
});
