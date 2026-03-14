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
import { useTheme } from "../../src/hooks/useTheme";
import { getStatusColors } from "../../src/constants/statusColors";
import { type Trip, type TripStatus, getStopsFromTrip } from "@nexus/shared";

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
  const { colors, isDark } = useTheme();
  const statusColors = getStatusColors(isDark);
  const statusColor = statusColors[trip.status];
  const stops = getStopsFromTrip(trip);

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
        {stops.map((stop, i) => (
          <View key={i}>
            {i > 0 && <View style={[styles.routeLine, { backgroundColor: colors.routeLine }]} />}
            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: stop.type === "pickup" ? "#22c55e" : "#ef4444" }]} />
              <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
                {stop.label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const { userDoc, firebaseUser } = useAuthStore();
  const { colors } = useTheme();
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
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      ) : !hasCompany ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Link to a company first to see trip history.
          </Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No trip history</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
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
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
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
  },
  list: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
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
    flex: 1,
  },
  routeLine: {
    width: 1,
    height: 12,
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
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
