import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useAuthStore } from "../../src/stores/auth";
import { subscribeToDriverTrips, respondToTrip, advanceToNextStop } from "../../src/services/trips";
import type { Trip, TripStatus } from "@nexus/shared";
import TripMap from "../../src/components/TripMap";

const STATUS_COLORS: Record<TripStatus, { bg: string; text: string }> = {
  pending: { bg: "#fef9c3", text: "#854d0e" },
  accepted: { bg: "#dbeafe", text: "#1e40af" },
  rejected: { bg: "#fee2e2", text: "#991b1b" },
  in_progress: { bg: "#e0e7ff", text: "#3730a3" },
  completed: { bg: "#dcfce7", text: "#166534" },
  cancelled: { bg: "#fee2e2", text: "#991b1b" },
};

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

function TripCard({
  trip,
  onRespond,
  onAdvanceStop,
  showMap,
}: {
  trip: Trip;
  onRespond: (tripId: string, status: TripStatus, extraFields?: Record<string, unknown>) => void;
  onAdvanceStop: (tripId: string, nextIndex: number) => void;
  showMap: boolean;
}) {
  const statusColor = STATUS_COLORS[trip.status];
  const stops = trip.stops ?? [];
  const currentIdx = trip.currentStopIndex ?? 0;
  const isInProgress = trip.status === "in_progress";
  const hasStops = stops.length > 0;
  const allStopsCompleted = currentIdx >= stops.length;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.badgeText, { color: statusColor.text }]}>
            {STATUS_LABELS[trip.status]}
          </Text>
        </View>
        <Text style={styles.time}>{formatTime(trip.createdAt)}</Text>
      </View>

      {/* Route */}
      <View style={styles.route}>
        <View style={styles.routePoint}>
          <View style={[styles.dot, { backgroundColor: "#22c55e" }]} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>Pickup</Text>
            <Text style={styles.routeName}>
              {trip.origin.label}
              {trip.origin.zipCode ? ` (${trip.origin.zipCode})` : ""}
            </Text>
          </View>
        </View>
        {/* Intermediate stops with progress indicators */}
        {stops.map((stop, i) => {
          const isCompleted = isInProgress && i < currentIdx;
          const isCurrent = isInProgress && i === currentIdx;
          return (
            <View key={i}>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.dot, {
                  backgroundColor: isCompleted ? "#22c55e" : isCurrent ? "#3b82f6" : "#f97316",
                  width: 8, height: 8, borderRadius: 4, marginHorizontal: 1,
                }]} />
                <View style={styles.routeInfo}>
                  <Text style={styles.routeLabel}>
                    Stop {i + 1}{isCompleted ? " (Done)" : isCurrent ? " (Next)" : ""}
                  </Text>
                  <Text style={[styles.routeName, isCompleted && styles.completedStopText]}>
                    {stop.label}
                    {stop.zipCode ? ` (${stop.zipCode})` : ""}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
        {trip.destination && (
          <>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: "#ef4444" }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Drop-off</Text>
                <Text style={styles.routeName}>
                  {trip.destination.label}
                  {trip.destination.zipCode ? ` (${trip.destination.zipCode})` : ""}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Inline Map with Route + ETA — only for the first active trip */}
      {showMap && (trip.status === "accepted" || trip.status === "in_progress") && (
        <TripMap trip={trip} />
      )}

      {/* Actions */}
      {trip.status === "pending" && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onRespond(trip.id, "rejected")}
          >
            <Text style={styles.rejectBtnText}>Decline</Text>
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

export default function TripsScreen() {
  const { userDoc, firebaseUser } = useAuthStore();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    return subscribeToDriverTrips(firebaseUser.uid, (newTrips) => {
      setTrips(newTrips);
      setInitialLoading(false);
    });
  }, [firebaseUser?.uid]);

  // Only show active trips — past trips are in the History tab
  const activeTrips = trips.filter((t) =>
    ["pending", "accepted", "in_progress"].includes(t.status)
  );

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

  // Only render map for the first trip that needs one (avoid multiple MapView instances)
  const mapTripId = activeTrips.find(
    (t) => t.status === "accepted" || t.status === "in_progress"
  )?.id;

  const hasCompany = !!userDoc?.companyId;

  return (
    <View style={styles.container}>
      {initialLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      ) : !hasCompany ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Link to a company first to receive trip assignments.
          </Text>
        </View>
      ) : activeTrips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No active trips</Text>
          <Text style={styles.emptyText}>
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
              showMap={item.id === mapTripId}
            />
          )}
          contentContainerStyle={styles.list}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              Active ({activeTrips.length})
            </Text>
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
    backgroundColor: "#fff",
  },
  list: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
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
    color: "#9ca3af",
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
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1a1a1a",
  },
  completedStopText: {
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  routeLine: {
    width: 1,
    height: 16,
    backgroundColor: "#d1d5db",
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
  acceptBtn: {
    backgroundColor: "#22c55e",
  },
  acceptBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  rejectBtn: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rejectBtnText: {
    color: "#6b7280",
    fontWeight: "600",
    fontSize: 14,
  },
  startBtn: {
    backgroundColor: "#3b82f6",
  },
  startBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  arrivedBtn: {
    backgroundColor: "#f97316",
  },
  arrivedBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  completeBtn: {
    backgroundColor: "#16a34a",
  },
  completeBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
});
