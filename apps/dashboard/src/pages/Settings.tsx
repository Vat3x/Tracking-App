import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { logout } from "@/services/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firebase";
import { COLLECTIONS } from "@nexus/shared";
import { Moon, Sun, User, Building2, Palette, Shield, Users, MapPin, LogOut, Crown, Loader2, CreditCard, Check } from "lucide-react";
import PaymentModal from "@/components/PaymentModal";

interface Plan {
  id: string;
  name: string;
  price: number | null;
  priceLabel?: string | null;
  interval: string;
  limit: string;
  features: string[];
  popular?: boolean;
  order: number;
}

export default function Settings() {
  const { userDoc, firebaseUser } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyPlan, setCompanyPlan] = useState<string | null>(null);
  const [maskedCard, setMaskedCard] = useState<string | null>(null);
  const [driverCount, setDriverCount] = useState<number | null>(null);
  const [tripCount, setTripCount] = useState<number | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  const API_BASE = "https://admin-panel-be9fc.web.app";

  useEffect(() => {
    if (!userDoc?.companyId) return;
    getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCompanyName(data.name ?? null);
        setCompanyPlan(data.plan ?? null);
        setMaskedCard(data.flittMaskedCard ?? null);
      }
    });
    getDocs(
      query(collection(db, COLLECTIONS.USERS), where("companyId", "==", userDoc.companyId), where("role", "==", "driver"))
    ).then((snap) => setDriverCount(snap.size));
    getDocs(
      query(collection(db, COLLECTIONS.TRIPS), where("companyId", "==", userDoc.companyId))
    ).then((snap) => setTripCount(snap.size));
  }, [userDoc?.companyId]);

  const TRACKER_PLANS: Plan[] = [
    { id: "starter", name: "Starter", price: 39, interval: "/mo", limit: "Small fleets", features: ["3 dispatchers", "Up to 15 drivers", "20-min tracking interval", "Trip history", "Email support"], order: 1 },
    { id: "growth",  name: "Growth",  price: 99, interval: "/mo", limit: "Growing fleets", features: ["10 dispatchers", "Up to 50 drivers", "10-min tracking interval", "Advanced analytics", "Priority support"], popular: true, order: 2 },
    { id: "business",name: "Business",price: 189,interval: "/mo", limit: "Large operations", features: ["Unlimited dispatchers", "Unlimited drivers", "5-min tracking interval", "Custom branding", "Dedicated support"], order: 3 },
  ];

  async function handleSubscribe(planName: string) {
    if (!firebaseUser) return;
    setSubscribing(planName);
    try {
      // Resolve planId from API by name
      const plansRes = await fetch(`${API_BASE}/api/public/plans`);
      const allPlans: (Plan & { product?: string })[] = await plansRes.json();
      const matched = allPlans.find(
        (p) => p.name.toLowerCase() === planName.toLowerCase()
      );
      if (!matched) {
        alert("Plan not found. Please contact support.");
        return;
      }
      const res = await fetch(`${API_BASE}/api/public/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: firebaseUser.uid,
          email: firebaseUser.email,
          planId: matched.id,
          product: "tracker",
          returnUrl: "https://load-mind.com/checkout/return",
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        setCheckoutUrl(data.checkout_url);
      } else {
        alert(data.message || "Failed to start checkout");
      }
    } catch {
      alert("Failed to start checkout. Please try again.");
    } finally {
      setSubscribing(null);
    }
  }

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    await logout();
    navigate("/login");
  }

  const initials = (userDoc?.displayName ?? "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
    {checkoutUrl && (
      <PaymentModal
        checkoutUrl={checkoutUrl}
        onClose={() => setCheckoutUrl(null)}
        onComplete={() => {
          setCheckoutUrl(null);
          if (userDoc?.companyId) {
            getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
              if (snap.exists()) {
                setCompanyPlan(snap.data().plan ?? null);
                setMaskedCard(snap.data().flittMaskedCard ?? null);
              }
            });
          }
        }}
      />
    )}
    <div className="h-screen flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="LoadMind" className="w-8 h-8" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">LoadMind Tracker</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{userDoc?.displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="h-8 px-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Dashboard
          </button>
          <button
            onClick={() => navigate("/trips")}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Trips
          </button>
          <button
            onClick={() => navigate("/history")}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            History
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-lg mx-auto space-y-5">

          {/* Profile card with avatar */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-white">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {userDoc?.displayName ?? "—"}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{userDoc?.email ?? "—"}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="w-3 h-3 text-gray-400" />
                  <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Role</p>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{userDoc?.role ?? "—"}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <User className="w-3 h-3 text-gray-400" />
                  <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">UID</p>
                </div>
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{firebaseUser?.uid ?? "—"}</p>
              </div>
            </div>
          </section>

          {/* Company */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-gray-400" />
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Company</h2>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Company Name</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{companyName ?? "—"}</p>
              </div>
              {userDoc?.companyId && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Company ID</p>
                  <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{userDoc.companyId}</p>
                </div>
              )}
            </div>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{driverCount ?? "—"}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Drivers</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{tripCount ?? "—"}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Trips</p>
                </div>
              </div>
            </div>
          </section>

          {/* Plan */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-4 h-4 text-gray-400" />
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plan</h2>
            </div>

            {/* Active plan badge */}
            {companyPlan && (
              <div className="flex items-center justify-between mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{companyPlan}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Active subscription</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                    Active
                  </span>
                  <button
                    onClick={() => setShowPlans((v) => !v)}
                    className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    {showPlans ? "Cancel" : "Change Plan"}
                  </button>
                </div>
              </div>
            )}

            {maskedCard && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-4">
                <CreditCard className="w-3 h-3" />
                {maskedCard}
              </div>
            )}

            {/* Plan selection */}
            {(!companyPlan || showPlans) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                {companyPlan ? "Change plan:" : "Choose a plan:"}
              </p>
              {TRACKER_PLANS.map((plan) => {
                  const isActive = companyPlan?.toLowerCase() === plan.name.toLowerCase();
                  const isLoading = subscribing === plan.name;
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        isActive
                          ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{plan.name}</p>
                            {plan.popular && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
                                Popular
                              </span>
                            )}
                            {isActive && (
                              <span className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                <Check className="w-3 h-3" /> Current
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{plan.limit}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                            ${plan.price}<span className="text-xs font-normal text-gray-400">{plan.interval}</span>
                          </span>
                          {!isActive && (
                            <button
                              onClick={() => handleSubscribe(plan.name)}
                              disabled={!!subscribing}
                              className="h-7 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              {isLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Select"
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </section>

          {/* Appearance */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-gray-400" />
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Appearance</h2>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === "light" ? (
                  <Sun className="w-5 h-5 text-amber-500" />
                ) : (
                  <Moon className="w-5 h-5 text-blue-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {theme === "light" ? "Light Mode" : "Dark Mode"}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                  </p>
                </div>
              </div>
              <button
                onClick={toggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  theme === "dark" ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    theme === "dark" ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Account */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <LogOut className="w-4 h-4 text-gray-400" />
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account</h2>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              Sign Out
            </button>
          </section>

          {/* App info */}
          <p className="text-center text-[10px] text-gray-300 dark:text-gray-700 pb-4">
            LoadMind Tracker v1.0
          </p>
        </div>
      </main>
    </div>
    </>
  );
}
