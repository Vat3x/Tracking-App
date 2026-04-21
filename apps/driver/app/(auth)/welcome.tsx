import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Logo } from "../../src/components/Logo";
import { useTheme } from "../../src/hooks/useTheme";

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Logo */}
      <View style={styles.logoSection}>
        <View style={[styles.logoWrap, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(31,106,181,0.07)" }]}>
          <Logo size={72} />
        </View>
        <Text style={styles.title}>LoadMind</Text>
        <Text style={styles.titleAccent}>TRACKER</Text>
      </View>

      {/* Main card */}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.cardText, { color: colors.text }]}>
          Open the invite link from your company to start registration and connect.
        </Text>
        <Text style={[styles.cardSecondary, { color: colors.textSecondary }]}>
          Don't have one? Ask your company to send you an invite.
        </Text>
      </View>

      {/* Sign in section */}
      <Text style={[styles.signinLabel, { color: colors.textSecondary }]}>Already have an account?</Text>
      <TouchableOpacity
        style={styles.signinBtn}
        onPress={() => router.push("/(auth)/login")}
      >
        <Text style={styles.signinBtnText}>Sign In</Text>
      </TouchableOpacity>

      <Text style={[styles.policy, { color: colors.textMuted }]}>
        By signing in, you agree to our{" "}
        <Text style={styles.policyLink} onPress={() => {}}>
          Privacy Policy
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoWrap: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1F6AB5",
    textAlign: "center",
  },
  titleAccent: {
    fontSize: 13,
    fontWeight: "700",
    color: "#33A15E",
    letterSpacing: 3,
    textAlign: "center",
    marginTop: 1,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    marginBottom: 24,
  },
  cardText: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 12,
  },
  cardSecondary: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  signinLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  signinBtn: {
    width: "100%",
    height: 50,
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  signinBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  policy: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  policyLink: {
    color: "#1a73e8",
    textDecorationLine: "underline",
  },
});
