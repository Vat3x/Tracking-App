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
import { subscribeToDriverTrips, respondToTrip } from "../../src/services/trips";
import type { Trip, TripStatus } from "@nexus/shared";

const STATUS_COLORS: Record<TripStatus, { bg: string; text: string }> = {
  pending: { bg: "#fef9c3", text: "#854d0e" },
  accepted: { bg: "#dbeafe", text: "#1e40af" },
  rejected: { bg: "#fee2e2", text: "#991b1b" },
  in_progress: { bg: "#e0e7ff", text: "#3730a3" },
  completed: { bg: "#dcfce7", text: "#166534" },
};

const STATUS_LABELS: Record<TripStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  in_progress: "In Progress",
  completed: "Completed",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TripCard({
  trip,
  onRespond,
}: {
  trip: Trip;
  onRespond: (tripId: string, status: TripStatus) => void;
}) {
  const statusColor = STATUS_COLORS[trip.status];

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
      </View>

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
            onPress={() => onRespond(trip.id, "in_progress")}
          >
            <Text style={styles.startBtnText}>Start Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      {trip.status === "in_progress" && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.completeBtn]}
            onPress={() => onRespond(trip.id, "completed")}
          >
            <Text style={styles.completeBtnText}>Complete Trip</Text>
          </TouchableOpacity>
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

  async function handleRespond(tripId: string, status: TripStatus) {
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
              await respondToTrip(tripId, status);
            } catch {
              Alert.alert("Error", "Failed to update trip. Try again.");
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

  const activeTrips = trips.filter((t) =>
    ["pending", "accepted", "in_progress"].includes(t.status)
  );
  const pastTrips = trips.filter((t) =>
    ["completed", "rejected"].includes(t.status)
  );

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
      ) : trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyText}>
            Your dispatcher will assign trips to you. They'll appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...activeTrips, ...pastTrips]}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripCard trip={item} onRespond={handleRespond} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            activeTrips.length > 0 ? (
              <Text style={styles.sectionTitle}>
                Active ({activeTrips.length})
              </Text>
            ) : null
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
