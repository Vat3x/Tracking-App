import { useState, useEffect } from "react";
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
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { loginWithEmail, registerDriver, getUserDoc } from "../../src/services/auth";
import { sendVerificationCode, verifyOtpAndSignIn, createPhoneUser } from "../../src/services/phoneAuth";
import { Logo } from "../../src/components/Logo";
import { useAuthStore } from "../../src/stores/auth";
import { auth } from "../../src/services/firebase";

// Common country codes (US-optimized)
const COUNTRY_CODES = [
  { code: "+1", label: "US/CA +1" },
  { code: "+52", label: "MX +52" },
  { code: "+44", label: "UK +44" },
  { code: "+49", label: "DE +49" },
  { code: "+33", label: "FR +33" },
  { code: "+91", label: "IN +91" },
  { code: "+86", label: "CN +86" },
  { code: "+81", label: "JP +81" },
  { code: "+995", label: "GE +995" },
];

type PhoneStep = "idle" | "sending" | "otp" | "verifying" | "name" | "saving";

export default function LoginScreen() {
  const router = useRouter();
  const { setFirebaseUser, setUserDoc } = useAuthStore();

  // Auth method toggle
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");

  // Email auth state
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("idle");
  const [newUserName, setNewUserName] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Reset phone state when switching tabs
  useEffect(() => {
    if (authMethod === "phone") {
      setPhoneStep("idle");
      setOtpCode("");
      setVerificationId(null);
      setNewUserName("");
      setResendCooldown(0);
    }
  }, [authMethod]);

  // ---- Email handlers (unchanged) ----

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    setEmailLoading(true);
    try {
      const user = await loginWithEmail(email, password);
      const userDoc = await getUserDoc(user.uid);

      if (userDoc?.role !== "driver") {
        Alert.alert("Error", "This app is for drivers only. Please use the web dashboard.");
        setEmailLoading(false);
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
      setEmailLoading(false);
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
    setEmailLoading(true);
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
      setEmailLoading(false);
    }
  }

  // ---- Phone handlers ----

  async function handleSendOtp() {
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 7) {
      Alert.alert("Error", "Please enter a valid phone number.");
      return;
    }
    const fullNumber = countryCode + digits;
    setPhoneStep("sending");
    try {
      const vId = await sendVerificationCode(fullNumber);
      setVerificationId(vId);
      setPhoneStep("otp");
      setResendCooldown(30);
    } catch (err: any) {
      setPhoneStep("idle");
      let msg = "Failed to send verification code.";
      if (err.code === "auth/too-many-requests") msg = "Too many attempts. Please try again later.";
      if (err.code === "auth/invalid-phone-number") msg = "Invalid phone number format.";
      Alert.alert("Error", msg);
    }
  }

  async function handleVerifyOtp() {
    if (!verificationId || otpCode.length !== 6) {
      Alert.alert("Error", "Please enter the 6-digit code.");
      return;
    }
    setPhoneStep("verifying");
    try {
      const user = await verifyOtpAndSignIn(verificationId, otpCode);
      const userDoc = await getUserDoc(user.uid);

      if (userDoc) {
        if (userDoc.role !== "driver") {
          Alert.alert("Error", "This app is for drivers only.");
          setPhoneStep("idle");
          return;
        }
        setFirebaseUser({ uid: user.uid, email: user.email });
        setUserDoc(userDoc);
        router.replace("/(main)/home");
      } else {
        // New user — need display name
        setPhoneStep("name");
      }
    } catch (err: any) {
      setPhoneStep("otp");
      if (err.code === "auth/invalid-verification-code") {
        Alert.alert("Error", "Invalid code. Please try again.");
      } else if (err.code === "auth/code-expired") {
        Alert.alert("Error", "Code expired. Please request a new one.");
        setPhoneStep("idle");
        setOtpCode("");
      } else {
        Alert.alert("Error", "Verification failed. Please try again.");
      }
    }
  }

  async function handleSaveNewUser() {
    if (!newUserName.trim()) {
      Alert.alert("Error", "Please enter your name.");
      return;
    }
    setPhoneStep("saving");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No authenticated user");

      const fullNumber = countryCode + phoneNumber.replace(/\D/g, "");
      await createPhoneUser(user.uid, fullNumber, newUserName.trim());
      const userDoc = await getUserDoc(user.uid);

      setFirebaseUser({ uid: user.uid, email: user.email });
      setUserDoc(userDoc);
      router.replace("/(main)/home");
    } catch {
      Alert.alert("Error", "Failed to save profile. Please try again.");
      setPhoneStep("name");
    }
  }

  function handleResendOtp() {
    if (resendCooldown > 0) return;
    setOtpCode("");
    handleSendOtp();
  }

  // ---- Render ----

  const phoneLoading = phoneStep === "sending" || phoneStep === "verifying" || phoneStep === "saving";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoRow}>
          <Logo size={56} />
          <View>
            <Text style={styles.title}>LoadMind</Text>
            <Text style={styles.titleAccent}>Tracker</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {authMethod === "phone"
            ? phoneStep === "name"
              ? "Set your name to continue"
              : "Sign in with your phone number"
            : isRegister
            ? "Create your driver account"
            : "Sign in to continue"}
        </Text>

        {/* Auth method toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, authMethod === "phone" && styles.toggleActive]}
            onPress={() => setAuthMethod("phone")}
          >
            <Text
              style={[styles.toggleText, authMethod === "phone" && styles.toggleTextActive]}
            >
              Phone
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, authMethod === "email" && styles.toggleActive]}
            onPress={() => setAuthMethod("email")}
          >
            <Text
              style={[styles.toggleText, authMethod === "email" && styles.toggleTextActive]}
            >
              Email
            </Text>
          </TouchableOpacity>
        </View>

        {/* ---- PHONE AUTH ---- */}
        {authMethod === "phone" && (
          <>
            {phoneStep === "idle" || phoneStep === "sending" ? (
              <>
                {/* Country code + phone input */}
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={styles.countryBtn}
                    onPress={() => setShowCountryPicker(!showCountryPicker)}
                  >
                    <Text style={styles.countryBtnText}>{countryCode}</Text>
                    <Text style={styles.countryArrow}>▼</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Phone number"
                    placeholderTextColor="#999"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    autoFocus
                  />
                </View>

                {showCountryPicker && (
                  <View style={styles.countryList}>
                    {COUNTRY_CODES.map((c) => (
                      <TouchableOpacity
                        key={c.code + c.label}
                        style={[
                          styles.countryItem,
                          c.code === countryCode && styles.countryItemActive,
                        ]}
                        onPress={() => {
                          setCountryCode(c.code);
                          setShowCountryPicker(false);
                        }}
                      >
                        <Text style={styles.countryItemText}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.button, phoneStep === "sending" && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={phoneStep === "sending"}
                >
                  {phoneStep === "sending" ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Send Code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : phoneStep === "otp" || phoneStep === "verifying" ? (
              <>
                <Text style={styles.otpLabel}>
                  Enter the 6-digit code sent to{" "}
                  <Text style={styles.otpPhone}>
                    {countryCode} {phoneNumber}
                  </Text>
                </Text>

                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="000000"
                  placeholderTextColor="#ccc"
                  value={otpCode}
                  onChangeText={(text) => setOtpCode(text.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  textAlign="center"
                />

                <TouchableOpacity
                  style={[styles.button, (phoneStep === "verifying" || otpCode.length !== 6) && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={phoneStep === "verifying" || otpCode.length !== 6}
                >
                  {phoneStep === "verifying" ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Verify</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={handleResendOtp}
                  disabled={resendCooldown > 0}
                >
                  <Text style={[styles.resendText, resendCooldown > 0 && styles.resendDisabled]}>
                    {resendCooldown > 0
                      ? `Resend code in ${resendCooldown}s`
                      : "Resend Code"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchButton}
                  onPress={() => {
                    setPhoneStep("idle");
                    setOtpCode("");
                    setVerificationId(null);
                  }}
                >
                  <Text style={styles.switchText}>Change phone number</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* phoneStep === "name" || "saving" */
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor="#999"
                  value={newUserName}
                  onChangeText={setNewUserName}
                  autoCapitalize="words"
                  autoFocus
                />

                <TouchableOpacity
                  style={[styles.button, phoneStep === "saving" && styles.buttonDisabled]}
                  onPress={handleSaveNewUser}
                  disabled={phoneStep === "saving"}
                >
                  {phoneStep === "saving" ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

          </>
        )}

        {/* ---- EMAIL AUTH ---- */}
        {authMethod === "email" && (
          <>
            {isRegister && (
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#999"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? "👁" : "👁‍🗨"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, emailLoading && styles.buttonDisabled]}
              onPress={isRegister ? handleRegister : handleLogin}
              disabled={emailLoading}
            >
              {emailLoading ? (
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
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1F6AB5",
  },
  titleAccent: {
    fontSize: 14,
    fontWeight: "600",
    color: "#33A15E",
    letterSpacing: 2,
    marginTop: -2,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginBottom: 24,
  },

  // Toggle
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    padding: 3,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: "#1a73e8",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  toggleTextActive: {
    color: "#fff",
  },

  // Phone input
  phoneRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  countryBtn: {
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fafafa",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countryBtnText: {
    fontSize: 15,
    color: "#000",
    fontWeight: "500",
  },
  countryArrow: {
    fontSize: 10,
    color: "#999",
  },
  phoneInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: "#fafafa",
    color: "#000",
  },
  countryList: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  countryItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  countryItemActive: {
    backgroundColor: "#e8f0fe",
  },
  countryItemText: {
    fontSize: 14,
    color: "#333",
  },

  // OTP
  otpLabel: {
    fontSize: 14,
    color: "#555",
    marginBottom: 16,
    lineHeight: 20,
  },
  otpPhone: {
    fontWeight: "600",
    color: "#333",
  },
  otpInput: {
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: "600",
  },
  resendBtn: {
    marginTop: 12,
    alignItems: "center",
  },
  resendText: {
    color: "#1a73e8",
    fontSize: 14,
  },
  resendDisabled: {
    color: "#999",
  },

  // Shared
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: "#fafafa",
    color: "#000",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#fafafa",
    height: 48,
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#000",
  },
  eyeButton: {
    paddingHorizontal: 12,
    height: 48,
    justifyContent: "center",
  },
  eyeIcon: {
    fontSize: 18,
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
