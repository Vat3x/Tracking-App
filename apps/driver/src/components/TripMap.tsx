import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import MapView, { Polyline, Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { fetchRoute, type RouteResult } from "../services/routing";
import type { Trip } from "@nexus/shared";

function formatETA(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `~${hrs} hr ${rem} min` : `~${hrs} hr`;
}

interface Props {
  trip: Trip;
}

export default function TripMap({ trip }: Props) {
  const mapRef = useRef<MapView>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  // Defer rendering to avoid crash when MapView mounts during FlatList re-render
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function loadRoute() {
      setLoading(true);
      setError(false);

      try {
        let waypoints: [number, number][];

        if (trip.status === "accepted") {
          // Driver → pickup: need current location
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== "granted") {
            if (!cancelled) setError(true);
            if (!cancelled) setLoading(false);
            return;
          }
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (cancelled) return;
          waypoints = [
            [loc.coords.longitude, loc.coords.latitude],
            [trip.origin.lng, trip.origin.lat],
          ];
        } else {
          // In progress: pickup → dropoff
          waypoints = [
            [trip.origin.lng, trip.origin.lat],
            [trip.destination.lng, trip.destination.lat],
          ];
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
  }, [ready, trip.id, trip.status]);

  if (!ready || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading route...</Text>
      </View>
    );
  }

  if (error || !route) {
    return null; // Silently skip if route can't be loaded
  }

  const routeCoords = route.coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));

  const isAccepted = trip.status === "accepted";

  // Initial region centered on route midpoint
  const midIdx = Math.floor(routeCoords.length / 2);
  const initialRegion: Region = {
    latitude: routeCoords[midIdx].latitude,
    longitude: routeCoords[midIdx].longitude,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  const handleMapReady = () => {
    try {
      if (mapRef.current && routeCoords.length > 1) {
        mapRef.current.fitToCoordinates(routeCoords, {
          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
          animated: false,
        });
      }
    } catch {
      // Silently ignore fit errors
    }
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
      >
        {/* Route polyline */}
        <Polyline
          coordinates={routeCoords}
          strokeColor={isAccepted ? "#eab308" : "#3b82f6"}
          strokeWidth={4}
          lineDashPattern={isAccepted ? [10, 5] : undefined}
        />

        {/* Pickup marker (green) */}
        <Marker
          coordinate={{
            latitude: trip.origin.lat,
            longitude: trip.origin.lng,
          }}
          pinColor="#22c55e"
          title="Pickup"
          description={trip.origin.label}
        />

        {/* Destination marker (red) — only for in_progress */}
        {!isAccepted && (
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

      {/* ETA bar */}
      <View style={styles.etaBar}>
        <Text style={styles.etaLabel}>
          {isAccepted ? "ETA to pickup" : "ETA to drop-off"}
        </Text>
        <Text style={styles.etaValue}>{formatETA(route.duration)}</Text>
      </View>
    </View>
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
