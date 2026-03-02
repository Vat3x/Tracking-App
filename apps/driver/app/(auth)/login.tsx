import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { loginWithEmail, registerDriver } from "../../src/services/auth";
import { getUserDoc } from "../../src/services/auth";
import { useAuthStore } from "../../src/stores/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { setFirebaseUser, setUserDoc } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const user = await loginWithEmail(email, password);
      const userDoc = await getUserDoc(user.uid);

      if (userDoc?.role !== "driver") {
        Alert.alert("Error", "This app is for drivers only. Please use the web dashboard.");
        setLoading(false);
        return;
      }

      setFirebaseUser({ uid: user.uid, email: user.email });
      setUserDoc(userDoc);
      router.replace("/(main)/home");
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        Alert.alert("Error", "Invalid email or password.");
      } else if (err.code === "auth/too-many-requests") {
        Alert.alert("Error", "Too many attempts. Please try again later.");
      } else {
        Alert.alert("Error", "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!displayName || !email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const user = await registerDriver(email, password, displayName);
      const userDoc = await getUserDoc(user.uid);

      setFirebaseUser({ uid: user.uid, email: user.email });
      setUserDoc(userDoc);
      router.replace("/(main)/home");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        Alert.alert("Error", "An account with this email already exists.");
      } else {
        Alert.alert("Error", "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Nexus Tracking</Text>
        <Text style={styles.subtitle}>
          {isRegister ? "Create your driver account" : "Sign in to continue"}
        </Text>

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={isRegister ? handleRegister : handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>
              {isRegister ? "Create Account" : "Sign In"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsRegister(!isRegister)}
        >
          <Text style={styles.switchText}>
            {isRegister
              ? "Already have an account? Sign in"
              : "Don't have an account? Register"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a73e8",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginBottom: 32,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  button: {
    height: 48,
    backgroundColor: "#1a73e8",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchButton: {
    marginTop: 16,
    alignItems: "center",
  },
  switchText: {
    color: "#1a73e8",
    fontSize: 14,
  },
});
