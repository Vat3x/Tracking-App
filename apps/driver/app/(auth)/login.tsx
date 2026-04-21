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
  Keyboard,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { loginWithEmail, registerDriver, resetPassword, getUserDoc } from "../../src/services/auth";
import { sendVerificationCode, verifyOtpAndSignIn, createPhoneUser, checkPhoneRegistered } from "../../src/services/phoneAuth";
import { acceptInvite } from "../../src/services/invites";
import { Logo } from "../../src/components/Logo";
import { useAuthStore } from "../../src/stores/auth";
import { useTheme } from "../../src/hooks/useTheme";
import nativeAuth from "@react-native-firebase/auth";
import { COUNTRY_CODES, isValidPhoneDigits, buildFullNumber, sanitizeOtp } from "@nexus/shared";

type PhoneStep = "idle" | "sending" | "otp" | "verifying" | "name" | "saving";

export default function LoginScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{
    inviteId?: string;
    inviteCompanyName?: string;
  }>();
  const { setFirebaseUser, setUserDoc, pendingInviteId, setPendingInviteId } = useAuthStore();

  const inviteId = params.inviteId || pendingInviteId;
  const inviteCompanyName = params.inviteCompanyName;
  const hasInvite = !!inviteId;

  // Email auth state — default to register when coming from invite link
  const [isRegister, setIsRegister] = useState(hasInvite);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  // Forgot password inline flow
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpPhone, setOtpPhone] = useState<string | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("idle");
  const [newUserName, setNewUserName] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Switch to register mode when invite arrives via warm-start deep link
  useEffect(() => {
    if (pendingInviteId) {
      setIsRegister(true);
    }
  }, [pendingInviteId]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function tryAcceptInvite(uid: string) {
    if (!inviteId) return;
    try {
      await acceptInvite(inviteId, uid);
      setPendingInviteId(null);
      await AsyncStorage.removeItem("@pending_invite_id");
      for (let i = 0; i < 7; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const doc = await getUserDoc(uid);
        if (doc?.companyId) return;
      }
    } catch (err: any) {
      console.error("tryAcceptInvite failed:", err?.code, err?.message);
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
        Alert.alert(
          "Account Exists",
          "An account with this email already exists. Tap 'Sign In' below to log in instead.",
          [{ text: "OK", onPress: () => setIsRegister(false) }]
        );
      } else {
        Alert.alert("Error", "Registration failed. Please try again.");
      }
    } finally {
      setEmailLoading(false);
    }
  }

  function openForgotMode() {
    setResetEmail(email.trim());
    setResetSent(false);
    setResetError("");
    setForgotMode(true);
  }

  async function handleSendReset() {
    const trimmed = resetEmail.trim();
    if (!trimmed) {
      setResetError("Please enter your email address.");
      return;
    }
    setResetError("");
    setResetLoading(true);
    try {
      await resetPassword(trimmed);
      setResetSent(true);
    } catch (err: any) {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        setResetError("No account found with this email.");
      } else if (err.code === "auth/invalid-email") {
        setResetError("Please enter a valid email address.");
      } else if (err.code === "auth/too-many-requests") {
        setResetError("Too many attempts. Please try again later.");
      } else {
        setResetError("Failed to send reset email. Please try again.");
      }
    } finally {
      setResetLoading(false);
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
      // Sign-in mode (no invite): check if phone is registered first
      if (!hasInvite) {
        const exists = await checkPhoneRegistered(fullNumber);
        if (!exists) {
          setPhoneStep("idle");
          Alert.alert(
            "No Account Found",
            "This phone number is not registered. Ask your dispatcher for an invite link to create an account."
          );
          return;
        }
      }

      const requestId = await sendVerificationCode(fullNumber);
      setOtpPhone(fullNumber);
      setOtpRequestId(requestId);
      setPhoneStep("otp");
      setResendCooldown(30);
    } catch (err: any) {
      setPhoneStep("idle");
      console.error("sendVerificationCode error:", err?.code, err?.message);
      let msg = "Failed to send verification code.";
      if (err.code === "auth/too-many-requests") msg = "Too many attempts. Please try again later.";
      if (err.code === "auth/invalid-phone-number") msg = "Invalid phone number format.";
      Alert.alert("Error", `${msg}\n\n${err?.code ?? "unknown"}`);
    }
  }

  async function handleVerifyOtp() {
    if (!otpPhone || otpCode.length !== 6) {
      Alert.alert("Error", "Please enter the 6-digit code.");
      return;
    }
    setPhoneStep("verifying");
    try {
      const user = await verifyOtpAndSignIn(otpPhone, otpCode, otpRequestId);
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
        Keyboard.dismiss();
        setPhoneStep("name");
      } else {
        await nativeAuth().signOut();
        Alert.alert(
          "No Account Found",
          "Please use an invite link from your dispatcher to register."
        );
        setPhoneStep("idle");
        setOtpCode("");
        setOtpPhone(null);
      }
    } catch (err: any) {
      setPhoneStep("otp");
      const msg: string = err?.message || "";
      if (msg.includes("Invalid or expired")) {
        Alert.alert("Error", "Invalid code. Please try again.");
      } else if (msg.includes("Max verification")) {
        Alert.alert("Error", "Too many attempts. Please request a new code.");
        setPhoneStep("idle");
        setOtpCode("");
        setOtpPhone(null);
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
      const user = nativeAuth().currentUser;
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

  // When in OTP or name step, show only that step full-screen
  const isPhoneMultiStep =
    phoneStep === "otp" ||
    phoneStep === "verifying" ||
    phoneStep === "name" ||
    phoneStep === "saving";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={[styles.logoWrap, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(31,106,181,0.07)" }]}>
            <Logo size={72} />
          </View>
          <Text style={styles.title}>LoadMind</Text>
          <Text style={styles.titleAccent}>TRACKER</Text>
        </View>

        {/* Invite banner */}
        {hasInvite && inviteCompanyName && (
          <View style={[styles.inviteBanner, isDark && { backgroundColor: "#052e16" }]}>
            <Text style={[styles.inviteBannerText, isDark && { color: "#86efac" }]}>
              Invited by <Text style={styles.inviteCompany}>{inviteCompanyName}</Text>
            </Text>
          </View>
        )}

        {/* Info banner — shown when no invite and idle */}

        {/* OTP subtitle */}
        {(phoneStep === "otp" || phoneStep === "verifying") && (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Enter the 6-digit code sent to {countryCode} {phoneNumber}
          </Text>
        )}
        {(phoneStep === "name" || phoneStep === "saving") && (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Set your name to continue
          </Text>
        )}

        {/* Form card */}
        <View style={[styles.formCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>

          {isPhoneMultiStep ? (
            /* ---- FULL-SCREEN PHONE MULTI-STEP ---- */
            <>
              {phoneStep === "otp" || phoneStep === "verifying" ? (
                <>
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
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
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
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.switchButton}
                    onPress={() => {
                      setPhoneStep("idle");
                      setOtpCode("");
                      setOtpPhone(null);
                      setOtpRequestId(null);
                    }}
                  >
                    <Text style={styles.switchText}>Change phone number</Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* name / saving */
                <>
                  <TextInput
                    style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.inputText }]}
                    placeholder="Your name"
                    placeholderTextColor={colors.placeholder}
                    value={newUserName}
                    onChangeText={setNewUserName}
                    keyboardType="default"
                    autoCapitalize="words"
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
          ) : (
            /* ---- COMBINED PHONE + EMAIL ---- */
            <>
              {/* PHONE SECTION */}
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Mobile</Text>

              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={[styles.countryBtn, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  onPress={() => { setShowCountryPicker(!showCountryPicker); setCountrySearch(""); }}
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
                />
              </View>

              {showCountryPicker && (
                <View style={[styles.countryList, { borderColor: colors.inputBorder, backgroundColor: colors.bgCard }]}>
                  <View style={[styles.countrySearchWrapper, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
                    <Text style={[styles.countrySearchIcon, { color: colors.placeholder }]}>🔍</Text>
                    <TextInput
                      style={[styles.countrySearch, { color: colors.inputText }]}
                      placeholder="Search country or code…"
                      placeholderTextColor={colors.placeholder}
                      value={countrySearch}
                      onChangeText={setCountrySearch}
                      autoCorrect={false}
                      autoCapitalize="none"
                      clearButtonMode="while-editing"
                    />
                  </View>
                  <ScrollView style={styles.countryScroll} keyboardShouldPersistTaps="handled">
                    {COUNTRY_CODES.filter((c) => {
                      const q = countrySearch.toLowerCase();
                      return !q || c.label.toLowerCase().includes(q);
                    }).map((c) => (
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
                          setCountrySearch("");
                        }}
                      >
                        <Text style={[styles.countryItemText, { color: colors.text }]}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
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

              {/* DIVIDER */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              {/* EMAIL SECTION */}
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Email</Text>

              {forgotMode ? (
                /* ---- FORGOT PASSWORD ---- */
                <>
                  {resetSent ? (
                    <View style={styles.resetSuccessWrap}>
                      <Text style={styles.resetSuccessIcon}>✉️</Text>
                      <Text style={[styles.resetSuccessTitle, { color: colors.text }]}>Check your inbox</Text>
                      <Text style={[styles.resetSuccessBody, { color: colors.textSecondary }]}>
                        We sent a reset link to{"\n"}<Text style={{ color: "#1a73e8" }}>{resetEmail}</Text>
                      </Text>
                      <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => { setForgotMode(false); setResetSent(false); }}
                      >
                        <Text style={styles.switchText}>← Back to Sign In</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.resetSubtitle, { color: colors.textSecondary }]}>
                        Enter your email and we'll send you a reset link.
                      </Text>

                      <TextInput
                        style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.inputText }]}
                        placeholder="Email"
                        placeholderTextColor={colors.placeholder}
                        value={resetEmail}
                        onChangeText={(t) => { setResetEmail(t); setResetError(""); }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                      />

                      {resetError ? <Text style={styles.resetError}>{resetError}</Text> : null}

                      <TouchableOpacity
                        style={[styles.button, resetLoading && styles.buttonDisabled]}
                        onPress={handleSendReset}
                        disabled={resetLoading}
                      >
                        {resetLoading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.buttonText}>Send Reset Link</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => { setForgotMode(false); setResetError(""); }}
                      >
                        <Text style={styles.switchText}>← Back to Sign In</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              ) : (
                /* ---- LOGIN / REGISTER ---- */
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

                  {!isRegister && (
                    <TouchableOpacity style={styles.forgotButton} onPress={openForgotMode}>
                      <Text style={styles.forgotText}>Forgot Password?</Text>
                    </TouchableOpacity>
                  )}

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
            </>
          )}
        </View>{/* /formCard */}

        {/* Go back hint — shown when no invite */}
        {!hasInvite && !isPhoneMultiStep && (
          <View style={[styles.goBackCard, isDark && { backgroundColor: "#2d2000", borderColor: "#78500a" }]}>
            <Text style={[styles.goBackText, isDark && { color: "#fcd34d" }]}>
              Don't have an account? Open the invite link from your company to register and connect.
            </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.goBackBtn}>← Go Back</Text>
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  logoSection: {
    alignItems: "center",
    marginBottom: 20,
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
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },

  inviteBanner: {
    backgroundColor: "#e8f5e9",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  inviteBannerText: {
    fontSize: 14,
    color: "#2e7d32",
    textAlign: "center",
  },
  inviteCompany: {
    fontWeight: "700",
  },

  goBackCard: {
    backgroundColor: "#fffbeb",
    borderWidth: 1.5,
    borderColor: "#fde68a",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: "center",
  },
  goBackText: {
    fontSize: 14,
    color: "#92400e",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 8,
  },
  goBackBtn: {
    color: "#1a73e8",
    fontSize: 14,
    fontWeight: "600",
  },

  formCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: "500",
  },

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
  countrySearchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    margin: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  countrySearchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  countrySearch: {
    flex: 1,
    height: 40,
    fontSize: 14,
  },
  countryScroll: {
    maxHeight: 200,
  },
  countryItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryItemText: {
    fontSize: 14,
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
    height: 50,
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: 4,
  },
  forgotText: {
    color: "#1a73e8",
    fontSize: 14,
  },
  resetSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  resetError: {
    color: "#ef4444",
    fontSize: 13,
    marginBottom: 8,
    marginTop: -4,
  },
  resetSuccessWrap: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  resetSuccessIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  resetSuccessTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  resetSuccessBody: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
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
    marginTop: 16,
  },
  policyLink: {
    color: "#1a73e8",
    textDecorationLine: "underline",
  },
});
