import { useState, useEffect, useRef, Component, type ReactNode } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import MapView, { Polyline, Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { fetchRoute, type RouteResult } from "../services/routing";
import { useTheme } from "../hooks/useTheme";
import { type Trip, getStopsFromTrip } from "@nexus/shared";

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
  selectedStopIndex?: number | null;
}

function TripMapInner({ trip, selectedStopIndex }: Props) {
  const { colors, mapStyle } = useTheme();
  const mapRef = useRef<MapView>(null);
  const mountedRef = useRef(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const stops = getStopsFromTrip(trip);
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

        if (isAccepted || isInProgress) {
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

          const driverCoord: [number, number] = [loc.coords.longitude, loc.coords.latitude];

          // If a specific stop is selected, route driver → that stop only
          if (selectedStopIndex != null && selectedStopIndex < stops.length) {
            const targetStop = stops[selectedStopIndex];
            waypoints = [driverCoord, [targetStop.lng, targetStop.lat]];
          } else {
            const relevantStops = isInProgress ? stops.slice(currentIdx) : stops;
            waypoints = [
              driverCoord,
              ...relevantStops.map((s) => [s.lng, s.lat] as [number, number]),
            ];
          }
        } else {
          waypoints = stops.map((s) => [s.lng, s.lat] as [number, number]);
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
  }, [trip.id, trip.status, trip.currentStopIndex, selectedStopIndex]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color="#3b82f6" />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading route...</Text>
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

  const getEtaLabel = () => {
    if (selectedStopIndex != null && selectedStopIndex < stops.length) {
      const s = stops[selectedStopIndex];
      return `ETA to ${s.type === "pickup" ? "pickup" : "drop-off"} ${selectedStopIndex + 1}`;
    }
    if (isAccepted) return "ETA to pickup";
    if (isInProgress && currentIdx < stops.length) {
      const nextStop = stops[currentIdx];
      return `ETA to ${nextStop.type === "pickup" ? "pickup" : "drop-off"} ${currentIdx + 1}`;
    }
    return "ETA";
  };

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
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
        showsTraffic
        customMapStyle={mapStyle}
      >
        <Polyline
          coordinates={routeCoords}
          strokeColor={selectedStopIndex != null ? "#f97316" : isAccepted ? "#eab308" : "#3b82f6"}
          strokeWidth={4}
          lineDashPattern={isAccepted && selectedStopIndex == null ? [10, 5] : undefined}
        />

        {stops.map((stop, i) => {
          const isCompleted = isInProgress && i < currentIdx;
          const color = stop.type === "pickup" ? "#22c55e" : "#ef4444";
          return (
            <Marker
              key={`stop-${i}`}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              pinColor={isCompleted ? "#22c55e" : color}
              title={`${stop.type === "pickup" ? "Pickup" : "Drop-off"} ${i + 1}${isCompleted ? " (Done)" : ""}`}
              description={stop.label}
              opacity={isCompleted ? 0.5 : 1}
            />
          );
        })}
      </MapView>

      <View style={[styles.etaBar, { backgroundColor: colors.bgCard }]}>
        <Text style={[styles.etaLabel, { color: colors.textSecondary }]}>{getEtaLabel()}</Text>
        <Text style={[styles.etaValue, { color: colors.text }]}>{formatETA(route.duration)}</Text>
      </View>
    </View>
  );
}

export default function TripMap({ trip, selectedStopIndex }: Props) {
  return (
    <MapErrorBoundary>
      <TripMapInner trip={trip} selectedStopIndex={selectedStopIndex} />
    </MapErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
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
    borderRadius: 12,
    borderWidth: 1,
  },
  loadingText: {
    fontSize: 12,
  },
  etaBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  etaLabel: {
    fontSize: 12,
  },
  etaValue: {
    fontSize: 14,
    fontWeight: "600",
  },
});
