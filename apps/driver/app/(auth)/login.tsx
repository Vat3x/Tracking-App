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
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { loginWithEmail, registerDriver, getUserDoc } from "../../src/services/auth";
import { sendVerificationCode, verifyOtpAndSignIn, createPhoneUser } from "../../src/services/phoneAuth";
import { acceptInvite } from "../../src/services/invites";
import { Logo } from "../../src/components/Logo";
import { useAuthStore } from "../../src/stores/auth";
import { useTheme } from "../../src/hooks/useTheme";
import { auth } from "../../src/services/firebase";
import { COUNTRY_CODES, extractDigits, isValidPhoneDigits, buildFullNumber, sanitizeOtp } from "@nexus/shared";

type PhoneStep = "idle" | "sending" | "otp" | "verifying" | "name" | "saving";

export default function LoginScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { inviteId, inviteCompanyName } = useLocalSearchParams<{
    inviteId?: string;
    inviteCompanyName?: string;
  }>();
  const { setFirebaseUser, setUserDoc } = useAuthStore();

  const hasInvite = !!inviteId;

  // Auth method toggle — default to email registration when coming from invite
  const [authMethod, setAuthMethod] = useState<"phone" | "email">(hasInvite ? "email" : "phone");

  // Email auth state — default to register when coming from invite link
  const [isRegister, setIsRegister] = useState(hasInvite);
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

  async function tryAcceptInvite(uid: string) {
    if (!inviteId) return;
    try {
      await acceptInvite(inviteId, uid);
      // Poll until cloud function sets companyId (up to 10s)
      for (let i = 0; i < 7; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const doc = await getUserDoc(uid);
        if (doc?.companyId) return;
      }
    } catch {
      // non-fatal
    }
  }

  // ---- Email handlers ----

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

      await tryAcceptInvite(user.uid);
      const finalDoc = inviteId ? await getUserDoc(user.uid) : userDoc;
      setFirebaseUser({ uid: user.uid, email: user.email });
      setUserDoc(finalDoc);
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
      await tryAcceptInvite(user.uid);
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
    if (!isValidPhoneDigits(phoneNumber)) {
      Alert.alert("Error", "Please enter a valid phone number.");
      return;
    }
    const fullNumber = buildFullNumber(countryCode, phoneNumber);
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
        await tryAcceptInvite(user.uid);
        const finalDoc = inviteId ? await getUserDoc(user.uid) : userDoc;
        setFirebaseUser({ uid: user.uid, email: user.email });
        setUserDoc(finalDoc);
        router.replace("/(main)/home");
      } else if (hasInvite) {
        setPhoneStep("name");
      } else {
        // Sign out the orphaned Firebase Auth user (no Firestore doc, no invite)
        await auth.signOut();
        Alert.alert(
          "No Account Found",
          "Please use an invite link from your dispatcher to register."
        );
        setPhoneStep("idle");
        setOtpCode("");
        setVerificationId(null);
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

      const fullNumber = buildFullNumber(countryCode, phoneNumber);
      await createPhoneUser(user.uid, fullNumber, newUserName.trim());
      await tryAcceptInvite(user.uid);
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

  const phoneLoading = phoneStep === "sending" || phoneStep === "verifying" || phoneStep === "saving";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
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
        {hasInvite && inviteCompanyName && (
          <View style={[styles.inviteBanner, isDark && { backgroundColor: "#052e16" }]}>
            <Text style={[styles.inviteBannerText, isDark && { color: "#86efac" }]}>
              Invited by <Text style={styles.inviteCompany}>{inviteCompanyName}</Text>
            </Text>
          </View>
        )}
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {authMethod === "phone"
            ? phoneStep === "name"
              ? "Set your name to continue"
              : hasInvite
              ? "Sign in or register with your phone"
              : "Sign in with your phone number"
            : isRegister
            ? "Create your driver account"
            : "Sign in to continue"}
        </Text>

        {/* Auth method toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.toggleBg }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, authMethod === "phone" && styles.toggleActive]}
            onPress={() => setAuthMethod("phone")}
          >
            <Text
              style={[styles.toggleText, { color: colors.textSecondary }, authMethod === "phone" && styles.toggleTextActive]}
            >
              Phone
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, authMethod === "email" && styles.toggleActive]}
            onPress={() => setAuthMethod("email")}
          >
            <Text
              style={[styles.toggleText, { color: colors.textSecondary }, authMethod === "email" && styles.toggleTextActive]}
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
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={[styles.countryBtn, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                    onPress={() => setShowCountryPicker(!showCountryPicker)}
                  >
                    <Text style={[styles.countryBtnText, { color: colors.inputText }]}>{countryCode}</Text>
                    <Text style={[styles.countryArrow, { color: colors.textMuted }]}>▼</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.phoneInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.inputText }]}
                    placeholder="Phone number"
                    placeholderTextColor={colors.placeholder}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    autoFocus
                  />
                </View>

                {showCountryPicker && (
                  <View style={[styles.countryList, { borderColor: colors.inputBorder, backgroundColor: colors.bgCard }]}>
                    {COUNTRY_CODES.map((c) => (
                      <TouchableOpacity
                        key={c.code + c.label}
                        style={[
                          styles.countryItem,
                          { borderBottomColor: colors.divider },
                          c.code === countryCode && { backgroundColor: isDark ? "#172554" : "#e8f0fe" },
                        ]}
                        onPress={() => {
                          setCountryCode(c.code);
                          setShowCountryPicker(false);
                        }}
                      >
                        <Text style={[styles.countryItemText, { color: colors.text }]}>{c.label}</Text>
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
                <Text style={[styles.otpLabel, { color: colors.textSecondary }]}>
                  Enter the 6-digit code sent to{" "}
                  <Text style={[styles.otpPhone, { color: colors.text }]}>
                    {countryCode} {phoneNumber}
                  </Text>
                </Text>

                <TextInput
                  style={[styles.input, styles.otpInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.inputText }]}
                  placeholder="000000"
                  placeholderTextColor={colors.placeholder}
                  value={otpCode}
                  onChangeText={(text) => setOtpCode(sanitizeOtp(text))}
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
                  <Text style={[styles.resendText, resendCooldown > 0 && { color: colors.textMuted }]}>
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
                  style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.inputText }]}
                  placeholder="Your name"
                  placeholderTextColor={colors.placeholder}
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
                style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.inputText }]}
                placeholder="Name"
                placeholderTextColor={colors.placeholder}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
            )}

            <TextInput
              style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.inputText }]}
              placeholder="Email"
              placeholderTextColor={colors.placeholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={[styles.passwordContainer, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.inputText }]}
                placeholder="Password"
                placeholderTextColor={colors.placeholder}
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

            {hasInvite && (
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
            )}
          </>
        )}

        <Text style={[styles.policyText, { color: colors.textMuted }]}>
          By signing in, you agree to our{" "}
          <Text
            style={styles.policyLink}
            onPress={() => Linking.openURL("https://load-mind.com/privacy")}
          >
            Privacy Policy
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: 24,
  },
  inviteBanner: {
    backgroundColor: "#e8f5e9",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  inviteBannerText: {
    fontSize: 14,
    color: "#2e7d32",
  },
  inviteCompany: {
    fontWeight: "700",
  },

  // Toggle
  toggleRow: {
    flexDirection: "row",
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
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countryBtnText: {
    fontSize: 15,
    fontWeight: "500",
  },
  countryArrow: {
    fontSize: 10,
  },
  phoneInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  countryList: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
  },
  countryItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryItemText: {
    fontSize: 14,
  },

  // OTP
  otpLabel: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  otpPhone: {
    fontWeight: "600",
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

  // Shared
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    height: 48,
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
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
  policyText: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 24,
  },
  policyLink: {
    color: "#1a73e8",
    textDecorationLine: "underline",
  },
});
