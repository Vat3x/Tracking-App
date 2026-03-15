import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/hooks/useTheme";
import { useAuthStore } from "../../src/stores/auth";
import { useTripsStore } from "../../src/stores/trips";

export default function MainLayout() {
  const { colors, isDark } = useTheme();
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const pendingCount = useTripsStore((s) => s.pendingCount);
  const subscribe = useTripsStore((s) => s.subscribe);
  const unsubscribe = useTripsStore((s) => s.unsubscribe);

  useEffect(() => {
    if (uid) subscribe(uid);
    return () => unsubscribe();
  }, [uid]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#1a73e8",
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
        },
        headerStyle: {
          backgroundColor: colors.headerBg,
        },
        headerTintColor: colors.text,
        headerShadowVisible: !isDark,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          headerTitle: "LoadMind Tracker",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Trips",
          headerTitle: "Active Trips",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" size={size} color={color} />
          ),
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#ef4444", fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          headerTitle: "Trip History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          headerTitle: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
