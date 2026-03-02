import { View, Text, StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.status}>Offline</Text>
      <Text style={styles.info}>Tap to start sharing your location</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  status: {
    fontSize: 32,
    fontWeight: "700",
    color: "#999",
    marginBottom: 8,
  },
  info: {
    fontSize: 16,
    color: "#666",
  },
});
