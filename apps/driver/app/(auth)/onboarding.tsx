import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Path, Circle, Line } from "react-native-svg";
import { Logo } from "../../src/components/Logo";
import { useTheme } from "../../src/hooks/useTheme";

const { width, height } = Dimensions.get("window");

const ONBOARDING_KEY = "@onboarding_seen";

function LocationPinIcon({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 80 96" fill="none">
      <Path
        d="M40 4C24.536 4 12 16.536 12 32C12 52 40 92 40 92C40 92 68 52 68 32C68 16.536 55.464 4 40 4Z"
        fill="#1F6AB5"
      />
      <Circle cx="40" cy="32" r="13" fill="white" />
      <Circle cx="40" cy="32" r="6.5" fill="#1F6AB5" />
    </Svg>
  );
}

function RouteIcon({ size = 80 }: { size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 80 80" fill="none">
      {/* Vertical dashed route line */}
      <Line x1="22" y1="16" x2="22" y2="64" stroke="#33A15E" strokeWidth="3" strokeDasharray="6 4" />
      {/* Origin */}
      <Circle cx="22" cy="16" r="8" fill="white" stroke="#33A15E" strokeWidth="3" />
      <Circle cx="22" cy="16" r="4" fill="#33A15E" />
      {/* Mid stop */}
      <Circle cx="22" cy="40" r="6" fill="white" stroke="#33A15E" strokeWidth="2.5" />
      <Circle cx="22" cy="40" r="3" fill="#33A15E" />
      {/* Destination */}
      <Path
        d="M22 54C17.582 54 14 57.582 14 62C14 68 22 76 22 76C22 76 30 68 30 62C30 57.582 26.418 54 22 54Z"
        fill="#33A15E"
      />
      <Circle cx="22" cy="62" r="4" fill="white" />
      {/* Label bars */}
      <Path d="M36 13 Q38 13 38 15.5 Q38 18 36 18 L62 18 Q64 18 64 15.5 Q64 13 62 13 Z" fill="rgba(51,161,94,0.2)" />
      <Path d="M36 37 Q38 37 38 39.5 Q38 42 36 42 L56 42 Q58 42 58 39.5 Q58 37 56 37 Z" fill="rgba(51,161,94,0.2)" />
      <Path d="M36 59 Q38 59 38 61.5 Q38 64 36 64 L60 64 Q62 64 62 61.5 Q62 59 60 59 Z" fill="rgba(51,161,94,0.2)" />
    </Svg>
  );
}

interface Slide {
  key: string;
  bg: string;
  bgDark: string;
  iconBg: string;
  iconBgDark: string;
  titleColor: string;
  titleColorDark: string;
  bodyColor: string;
  bodyColorDark: string;
  skipColor: string;
  dotActiveColor: string;
  nextBg: string;
}

const SLIDES: Slide[] = [
  {
    key: "welcome",
    bg: "#ffffff",
    bgDark: "#0f0f0f",
    iconBg: "transparent",
    iconBgDark: "transparent",
    titleColor: "#1F6AB5",
    titleColorDark: "#60a5fa",
    bodyColor: "#6b7280",
    bodyColorDark: "#9ca3af",
    skipColor: "#9ca3af",
    dotActiveColor: "#1F6AB5",
    nextBg: "#1F6AB5",
  },
  {
    key: "gps",
    bg: "#eff6ff",
    bgDark: "#172554",
    iconBg: "rgba(219,234,254,0.8)",
    iconBgDark: "rgba(30,58,138,0.6)",
    titleColor: "#1e3a5f",
    titleColorDark: "#bfdbfe",
    bodyColor: "#3b82f6",
    bodyColorDark: "#93c5fd",
    skipColor: "#93c5fd",
    dotActiveColor: "#1a73e8",
    nextBg: "#1F6AB5",
  },
  {
    key: "trips",
    bg: "#f0fdf4",
    bgDark: "#052e16",
    iconBg: "rgba(187,247,208,0.8)",
    iconBgDark: "rgba(5,46,22,0.6)",
    titleColor: "#14532d",
    titleColorDark: "#bbf7d0",
    bodyColor: "#16a34a",
    bodyColorDark: "#86efac",
    skipColor: "#86efac",
    dotActiveColor: "#16a34a",
    nextBg: "#16a34a",
  },
];

const CONTENT = [
  {
    headline: "Welcome to\nLoadMind Tracker",
    body: "The smarter way to manage your deliveries.",
    isWelcome: true,
  },
  {
    headline: "Employer Location Tracking",
    body: "Your employer monitors your real-time location during work hours. Tracking runs continuously in the background and is required to receive job assignments.",
    isWelcome: false,
  },
  {
    headline: "Manage Your Trips",
    body: "Accept assignments, view routes, and track your progress — all in one place.",
    isWelcome: false,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    const pendingInviteId = await AsyncStorage.getItem("@pending_invite_id");
    if (pendingInviteId) {
      router.replace({ pathname: "/(auth)/login", params: { inviteId: pendingInviteId } } as any);
    } else {
      router.replace("/(auth)/login");
    }
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      finish();
    }
  }

  const slide = SLIDES[currentIndex];
  const bg = isDark ? slide.bgDark : slide.bg;
  const skipColor = isDark ? slide.skipColor : "#9ca3af";
  const dotActive = slide.dotActiveColor;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Skip button */}
        <TouchableOpacity style={styles.skipBtn} onPress={finish} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <Text style={[styles.skipText, { color: skipColor }]}>Skip</Text>
        </TouchableOpacity>

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          scrollEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(idx);
          }}
          renderItem={({ item, index }) => {
            const s = item;
            const c = CONTENT[index];
            const slideBg = isDark ? s.bgDark : s.bg;
            const iconBg = isDark ? s.iconBgDark : s.iconBg;
            const titleColor = isDark ? s.titleColorDark : s.titleColor;
            const bodyColor = isDark ? s.bodyColorDark : s.bodyColor;

            return (
              <View style={[styles.slide, { width, backgroundColor: slideBg }]}>
                {/* Icon area */}
                <View style={styles.iconArea}>
                  {c.isWelcome ? (
                    <View style={[styles.logoWrap, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(31,106,181,0.06)" }]}>
                      <Logo size={width * 0.32} />
                    </View>
                  ) : index === 1 ? (
                    <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                      <LocationPinIcon size={72} />
                    </View>
                  ) : (
                    <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                      <RouteIcon size={72} />
                    </View>
                  )}
                </View>

                {/* Text area */}
                <View style={styles.textArea}>
                  <Text style={[styles.headline, { color: titleColor }, c.isWelcome && styles.headlineWelcome]}>
                    {c.headline}
                  </Text>
                  <Text style={[styles.body, { color: bodyColor }]}>{c.body}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          {/* Dots */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex
                    ? [styles.dotActive, { backgroundColor: dotActive }]
                    : { backgroundColor: isDark ? "#3a3a3a" : "#d1d5db" },
                ]}
              />
            ))}
          </View>

          {/* Next / Get Started */}
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: slide.nextBg }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextText}>
              {currentIndex === SLIDES.length - 1 ? "I Agree & Get Started" : "Next"}
            </Text>
            <Text style={styles.nextArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  skipBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    zIndex: 10,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  logoWrap: {
    borderRadius: 32,
    padding: 28,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  textArea: {
    flex: 0.8,
    alignItems: "center",
    paddingBottom: 16,
  },
  headline: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 34,
  },
  headlineWelcome: {
    fontSize: 28,
  },
  body: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  bottomControls: {
    paddingHorizontal: 32,
    paddingBottom: 36,
    gap: 20,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 22,
    borderRadius: 4,
    height: 8,
  },
  nextBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  nextText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  nextArrow: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
