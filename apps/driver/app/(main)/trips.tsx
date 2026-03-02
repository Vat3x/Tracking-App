import { View, Text, StyleSheet } from "react-native";

export default function TripsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.empty}>No trip assignments yet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
  },
  empty: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginTop: 48,
  },
});
