import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useAuthStore } from "../../src/stores/auth";
import { subscribeToDriverTrips } from "../../src/services/trips";
import type { Trip, TripStatus } from "@nexus/shared";

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

function HistoryCard({ trip }: { trip: Trip }) {
  const statusColor = STATUS_COLORS[trip.status];
  const stopCount = trip.stops?.length ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.badgeText, { color: statusColor.text }]}>
            {STATUS_LABELS[trip.status]}
          </Text>
        </View>
        <Text style={styles.time}>{formatTime(trip.createdAt)}</Text>
      </View>

      {/* Route summary */}
      <View style={styles.route}>
        <View style={styles.routePoint}>
          <View style={[styles.dot, { backgroundColor: "#22c55e" }]} />
          <Text style={styles.routeText} numberOfLines={1}>
            {trip.origin.label}
          </Text>
        </View>
        {stopCount > 0 && (
          <>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: "#f97316", width: 6, height: 6, borderRadius: 3, marginHorizontal: 1 }]} />
              <Text style={styles.stopsText}>{stopCount} stop{stopCount > 1 ? "s" : ""}</Text>
            </View>
          </>
        )}
        {trip.destination && (
          <>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: "#ef4444" }]} />
              <Text style={styles.routeText} numberOfLines={1}>
                {trip.destination.label}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const { userDoc, firebaseUser } = useAuthStore();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    return subscribeToDriverTrips(firebaseUser.uid, (allTrips) => {
      const pastTrips = allTrips.filter((t) =>
        ["completed", "rejected", "cancelled"].includes(t.status)
      );
      setTrips(pastTrips);
      setLoading(false);
    });
  }, [firebaseUser?.uid]);

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }

  const hasCompany = !!userDoc?.companyId;

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      ) : !hasCompany ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Link to a company first to see trip history.
          </Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No trip history</Text>
          <Text style={styles.emptyText}>
            Completed, declined, and cancelled trips will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <HistoryCard trip={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              Past Trips ({trips.length})
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
    marginBottom: 12,
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
  route: {},
  routePoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1a1a1a",
    flex: 1,
  },
  stopsText: {
    fontSize: 13,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  routeLine: {
    width: 1,
    height: 12,
    backgroundColor: "#d1d5db",
    marginLeft: 3.5,
    marginVertical: 2,
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
