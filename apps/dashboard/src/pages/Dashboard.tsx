import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuthStore } from "@/stores/auth";
import { useDriversStore } from "@/stores/drivers";
import { logout } from "@/services/auth";
import { subscribeToInvites, generateInviteLink, expireInvite } from "@/services/invites";
import { subscribeToCompanyLocations } from "@/services/locations";
import { subscribeToCompanyTrips } from "@/services/trips";
import { getCompanyDrivers } from "@/services/drivers";
import InviteModal from "@/components/InviteModal";
import TripModal from "@/components/TripModal";
import MapView from "@/components/MapView";
import DriverList from "@/components/DriverList";
import { useTripNotifications } from "@/hooks/useTripNotifications";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { toast } from "sonner";
import { COLLECTIONS, type Invite, type User, type Trip, type TripStatus, getStopsFromTrip } from "@nexus/shared";
import ThemeToggle from "@/components/ThemeToggle";
import PaymentModal from "@/components/PaymentModal";
import { Crown, Loader2 } from "lucide-react";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type DatePreset = "today" | "7d" | "30d" | "all";

function getDateRange(preset: DatePreset): { start: number; end: number } {
  const now = Date.now();
  switch (preset) {
    case "today": {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      return { start: s.getTime(), end: now };
    }
    case "7d":
      return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
    case "30d":
      return { start: now - 30 * 24 * 60 * 60 * 1000, end: now };
    case "all":
      return { start: 0, end: now };
  }
}

function InviteStatusBadge({ invite }: { invite: Invite }) {
  const now = Date.now();
  if (invite.status === "accepted") {
    return <span className="text-xs font-medium text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Accepted</span>;
  }
  if (invite.status === "expired" || invite.expiresAt < now) {
    return <span className="text-xs font-medium text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-700 px-2 py-0.5 rounded-full">Expired</span>;
  }
  return <span className="text-xs font-medium text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">Pending</span>;
}

export default function Dashboard() {
  const { userDoc, firebaseUser } = useAuthStore();
  const { drivers, selectedDriverId, setDrivers, selectDriver } = useDriversStore();
  const navigate = useNavigate();

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [tripFormOpen, setTripFormOpen] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [driverProfiles, setDriverProfiles] = useState<Map<string, User>>(new Map());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [companyName, setCompanyName] = useState("My Company");
  const [companyPlan, setCompanyPlan] = useState<string | null>(null);
  const [requestedPlan, setRequestedPlan] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tripFormDriverId, setTripFormDriverId] = useState<string | undefined>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDatePreset, setHistoryDatePreset] = useState<DatePreset>("7d");
  const [historyTripFilter, setHistoryTripFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [selectedHistoryTripId, setSelectedHistoryTripId] = useState<string | null>(null);
  const [newDriverIds, setNewDriverIds] = useState<Set<string>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [driversOpen, setDriversOpen] = useState(false);
  const newDriverTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const knownDriverIdsRef = useRef<Set<string> | null>(null);

  // Toast notifications for trip status changes
  useTripNotifications(trips, driverProfiles);

  // Fetch company name
  useEffect(() => {
    if (!userDoc?.companyId) return;
    getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
      if (snap.exists()) {
        setCompanyName(snap.data().name ?? "My Company");
        setCompanyPlan(snap.data().plan ?? null);
        setRequestedPlan(snap.data().requestedPlan ?? null);
      }
    });
  }, [userDoc?.companyId]);

  // Subscribe to invites
  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToInvites(userDoc.companyId, setInvites);
  }, [userDoc?.companyId]);

  // Subscribe to real-time driver locations
  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToCompanyLocations(userDoc.companyId, setDrivers);
  }, [userDoc?.companyId, setDrivers]);

  // Subscribe to trips (for active trip marker colors)
  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToCompanyTrips(userDoc.companyId, setTrips);
  }, [userDoc?.companyId]);

  // Load driver profiles from Firestore
  useEffect(() => {
    if (!userDoc?.companyId) return;
    getCompanyDrivers(userDoc.companyId).then(setDriverProfiles);
  }, [userDoc?.companyId]);

  // Re-fetch profiles when a new driver appears that we don't have a profile for
  useEffect(() => {
    if (!userDoc?.companyId) return;
    const unknownDriver = drivers.find((d) => !driverProfiles.has(d.driverId));
    if (unknownDriver) {
      getCompanyDrivers(userDoc.companyId).then(setDriverProfiles);
    }
  }, [drivers, driverProfiles, userDoc?.companyId]);

  // Track new drivers: compare RTDB snapshots, skip first load
  useEffect(() => {
    if (drivers.length === 0) return;
    const currentIds = new Set(drivers.map((d) => d.driverId));
    if (knownDriverIdsRef.current !== null) {
      const freshIds = [...currentIds].filter((id) => !knownDriverIdsRef.current!.has(id));
      if (freshIds.length > 0) {
        setNewDriverIds((prev) => {
          const next = new Set(prev);
          freshIds.forEach((id) => next.add(id));
          return next;
        });
        for (const id of freshIds) {
          if (newDriverTimers.current.has(id)) clearTimeout(newDriverTimers.current.get(id));
          newDriverTimers.current.set(
            id,
            setTimeout(() => {
              setNewDriverIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              newDriverTimers.current.delete(id);
            }, 20000)
          );
        }
      }
    }
    knownDriverIdsRef.current = currentIds;
  }, [drivers]);

  const PLAN_LABELS: Record<string, string> = {
    starter: "Starter — $39/mo",
    growth: "Growth — $99/mo",
    business: "Business — $189/mo",
  };

  async function handleSubscribe() {
    if (!firebaseUser || !requestedPlan) return;
    setSubscribing(true);
    try {
      const plansRes = await fetch("https://admin-panel-be9fc.web.app/api/public/plans");
      const plans = await plansRes.json();
      const matchedPlan = plans.find(
        (p: any) => p.product === "tracker" && p.name.toLowerCase() === requestedPlan.toLowerCase()
      );
      if (!matchedPlan) { alert("Plan not found. Please contact support."); setSubscribing(false); return; }

      const res = await fetch("https://admin-panel-be9fc.web.app/api/public/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: firebaseUser.uid,
          email: firebaseUser.email,
          planId: matchedPlan.id,
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
      setSubscribing(false);
    }
  }

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    await logout();
    navigate("/login");
  }

  function handleCopyLink(inviteId: string) {
    navigator.clipboard.writeText(generateInviteLink(inviteId));
    setCopiedId(inviteId);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleExpire(inviteId: string) {
    try {
      await expireInvite(inviteId);
      toast.success("Invite revoked");
    } catch {
      toast.error("Failed to revoke invite");
    }
  }

  const handleSelectDriver = useCallback(
    (driverId: string | null) => selectDriver(driverId),
    [selectDriver]
  );

  const activeDriverIds = useMemo(
    () => new Set(
      trips
        .filter((t) => t.status === "accepted" || t.status === "in_progress")
        .map((t) => t.driverId)
        .filter((id): id is string => id !== null)
    ),
    [trips]
  );

  const pendingInvites = invites.filter(
    (i) => i.status === "pending" && i.expiresAt > Date.now()
  ).length;

  // History panel computed values
  const historyDateRange = useMemo(() => getDateRange(historyDatePreset), [historyDatePreset]);

  const historyTrips = useMemo(() => {
    if (!selectedDriverId) return [];
    let t = trips.filter(
      (trip) =>
        trip.driverId === selectedDriverId &&
        trip.createdAt >= historyDateRange.start &&
        trip.createdAt <= historyDateRange.end
    );
    if (historyTripFilter === "completed") t = t.filter((trip) => trip.status === "completed");
    if (historyTripFilter === "cancelled") t = t.filter((trip) => ["cancelled", "rejected"].includes(trip.status));
    return t;
  }, [trips, selectedDriverId, historyDateRange, historyTripFilter]);

  const selectedHistoryTrip = useMemo(
    () => historyTrips.find((t) => t.id === selectedHistoryTripId) ?? null,
    [historyTrips, selectedHistoryTripId]
  );

  const handleViewHistory = useCallback((driverId: string) => {
    selectDriver(driverId);
    setHistoryOpen(true);
    setInvitesOpen(false);
    setTripFormOpen(false);
    setSelectedHistoryTripId(null);
  }, [selectDriver]);

  // Clear selected history trip when driver changes
  useEffect(() => {
    setSelectedHistoryTripId(null);
  }, [selectedDriverId]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="relative bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="LoadMind" className="w-8 h-8" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">LoadMind Tracker</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{userDoc?.displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop nav buttons */}
          <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => navigate("/trips")}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Trips
          </button>
          <button
            onClick={() => { setInvitesOpen(!invitesOpen); setTripFormOpen(false); }}
            className="relative h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Invites
            {pendingInvites > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingInvites}
              </span>
            )}
          </button>
          <button
            onClick={() => { setHistoryOpen(!historyOpen); setInvitesOpen(false); setTripFormOpen(false); setSelectedHistoryTripId(null); }}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            History
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Settings
          </button>
          <ThemeToggle />
          <button
            onClick={() => { setTripFormDriverId(undefined); setTripFormOpen(true); setInvitesOpen(false); }}
            className="h-8 px-3 border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 text-sm font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            New Trip
          </button>
          <button
            onClick={() => setInviteModalOpen(true)}
            className="h-8 px-3 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Invite Driver
          </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {pendingInvites > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingInvites}
              </span>
            )}
          </button>

          <div className="relative ml-1">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-medium flex items-center justify-center hover:bg-blue-700 transition-colors"
            >
              {userDoc?.displayName?.charAt(0).toUpperCase() ?? "U"}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-10 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{userDoc?.displayName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{userDoc?.email}</p>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate("/settings"); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Settings
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <>
            <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
            <div className="md:hidden absolute right-2 top-14 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
              <button
                onClick={() => { setMobileMenuOpen(false); setTripFormDriverId(undefined); setTripFormOpen(true); setInvitesOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                + New Trip
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); setInviteModalOpen(true); }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Invite Driver
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMobileMenuOpen(false); navigate("/trips"); }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Trips
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); setInvitesOpen(true); setTripFormOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
              >
                <span>Invites</span>
                {pendingInvites > 0 && (
                  <span className="w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingInvites}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); setHistoryOpen(true); setInvitesOpen(false); setTripFormOpen(false); setSelectedHistoryTripId(null); }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                History
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); navigate("/settings"); }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Settings
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              <div className="px-3 py-2"><ThemeToggle /></div>
            </div>
          </>
        )}
      </header>

      {/* Main content: map + driver panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Map */}
        <div className="flex-1 flex">
          <MapView
            drivers={drivers}
            driverProfiles={driverProfiles}
            selectedDriverId={selectedDriverId}
            onSelectDriver={handleSelectDriver}
            activeDriverIds={activeDriverIds}
            trips={trips}
            companyId={userDoc?.companyId ?? undefined}
            historyTrip={historyOpen ? selectedHistoryTrip : null}
            sidebarWidth={historyOpen || invitesOpen ? 384 : 0}
          />
        </div>

        {/* Driver side panel */}
        <DriverList
          drivers={drivers}
          driverProfiles={driverProfiles}
          selectedDriverId={selectedDriverId}
          onSelectDriver={(id) => { selectDriver(id); setDriversOpen(false); }}
          activeDriverIds={activeDriverIds}
          trips={trips}
          newDriverIds={newDriverIds}
          onRefreshProfiles={() => userDoc?.companyId && getCompanyDrivers(userDoc.companyId).then(setDriverProfiles)}
          onCreateTrip={(driverId) => { setTripFormDriverId(driverId); setTripFormOpen(true); setInvitesOpen(false); setDriversOpen(false); }}
          onViewHistory={(id) => { handleViewHistory(id); setDriversOpen(false); }}
          mobileOpen={driversOpen}
          onMobileClose={() => setDriversOpen(false)}
        />

        {/* Mobile "Drivers" FAB */}
        {!driversOpen && !invitesOpen && !historyOpen && !tripFormOpen && (
          <button
            onClick={() => setDriversOpen(true)}
            className="md:hidden fixed bottom-4 right-4 z-30 h-12 px-5 bg-blue-600 text-white text-sm font-medium rounded-full shadow-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
            </svg>
            Drivers
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20">
              {drivers.filter((d) => d.current.isOnline).length}
            </span>
          </button>
        )}

        {/* New Trip slide-over panel */}
        {tripFormOpen && (
          <TripModal
            key={tripFormDriverId ?? "new"}
            open={tripFormOpen}
            onClose={() => { setTripFormOpen(false); setTripFormDriverId(undefined); }}
            driverProfiles={driverProfiles}
            sidebar
            defaultDriverId={tripFormDriverId}
          />
        )}

        {/* Invites slide-over panel */}
        {invitesOpen && (
          <>
            <div
              className="absolute inset-0 bg-black/10 z-20"
              onClick={() => setInvitesOpen(false)}
            />
            <div className="absolute left-0 top-0 bottom-0 w-full sm:w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-xl z-30 flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Tracking Requests
                </h2>
                <button
                  onClick={() => setInvitesOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {invites.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      No invites yet. Generate a tracking request link.
                    </p>
                    <button
                      onClick={() => {
                        setInvitesOpen(false);
                        setInviteModalOpen(true);
                      }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Create first invite
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {invites.map((invite) => {
                      const isActive =
                        invite.status === "pending" && invite.expiresAt > Date.now();
                      return (
                        <div key={invite.id} className="px-5 py-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
                              {invite.id.slice(0, 8)}...
                            </span>
                            <InviteStatusBadge invite={invite} />
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Created {formatTime(invite.createdAt)}
                            {invite.status === "accepted" && invite.acceptedBy && (
                              <> · Driver: {invite.acceptedBy.slice(0, 8)}...</>
                            )}
                          </p>
                          {isActive && (
                            <div className="flex items-center gap-3 mt-2">
                              <button
                                onClick={() => handleCopyLink(invite.id)}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700"
                              >
                                {copiedId === invite.id ? "Copied!" : "Copy link"}
                              </button>
                              <button
                                onClick={() => handleExpire(invite.id)}
                                className="text-xs text-gray-400 hover:text-red-500"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* History slide-over panel */}
        {historyOpen && (
            <div className="absolute left-0 top-0 bottom-0 w-full sm:w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-xl z-30 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">History</h2>
                  {selectedDriverId && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {driverProfiles.get(selectedDriverId)?.displayName ?? "Driver"}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setHistoryOpen(false); setSelectedHistoryTripId(null); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              {!selectedDriverId ? (
                <div className="flex-1 flex items-center justify-center px-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">Select a driver to view history</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      GPS track and trip history will appear here
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Date range presets */}
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-1">
                      {(["today", "7d", "30d", "all"] as const).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => { setHistoryDatePreset(preset); setSelectedHistoryTripId(null); }}
                          className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                            historyDatePreset === preset
                              ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium"
                              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                          }`}
                        >
                          {preset === "today" ? "Today" : preset === "7d" ? "7 Days" : preset === "30d" ? "30 Days" : "All"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-4">
                    <div>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{historyTrips.length}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">Trips</p>
                    </div>
                  </div>

                  {/* Trip filter tabs */}
                  <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                    {(["all", "completed", "cancelled"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => { setHistoryTripFilter(f); setSelectedHistoryTripId(null); }}
                        className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                          historyTripFilter === f
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium"
                            : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                      >
                        {f === "all" ? "All" : f === "completed" ? "Completed" : "Cancelled"}
                      </button>
                    ))}
                  </div>

                  {/* Trip list */}
                  <div className="flex-1 overflow-y-auto">
                    {historyTrips.length === 0 ? (
                      <div className="px-4 py-12 text-center">
                        <p className="text-sm text-gray-400 dark:text-gray-500">No trips found</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50 dark:divide-gray-700">
                        {historyTrips.map((trip) => {
                          const isSelected = selectedHistoryTripId === trip.id;
                          const statusColors: Record<TripStatus, string> = {
                            pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                            accepted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                            rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            in_progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
                            completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                            cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          };
                          return (
                            <button
                              key={trip.id}
                              onClick={() => setSelectedHistoryTripId(isSelected ? null : trip.id)}
                              className={`w-full text-left px-4 py-3 transition-colors ${
                                isSelected
                                  ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                                  : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColors[trip.status]}`}>
                                  {trip.status.replace("_", " ")}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  {formatTime(trip.createdAt)}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {getStopsFromTrip(trip).map((stop, i) => (
                                  <div key={i} className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      stop.type === "pickup" ? "bg-green-500" : "bg-red-500"
                                    }`} />
                                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{stop.label}</span>
                                  </div>
                                ))}
                              </div>
                              {trip.respondedAt && (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                  Responded {formatTime(trip.respondedAt)}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                      onClick={() => navigate(`/history/${selectedDriverId}`)}
                      className="w-full h-9 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      Open full history page
                    </button>
                  </div>
                </>
              )}
            </div>
        )}
      </div>

      <InviteModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        companyName={companyName}
      />

      {/* Flitt payment modal */}
      {checkoutUrl && (
        <PaymentModal
          checkoutUrl={checkoutUrl}
          onClose={() => setCheckoutUrl(null)}
          onComplete={() => {
            setCheckoutUrl(null);
            // Re-fetch company plan to dismiss overlay
            if (userDoc?.companyId) {
              getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
                if (snap.exists()) {
                  setCompanyPlan(snap.data().plan ?? null);
                  setRequestedPlan(snap.data().requestedPlan ?? null);
                }
              });
            }
          }}
        />
      )}

      {/* Purchase overlay — shown when user has requestedPlan but no active plan */}
      {!companyPlan && requestedPlan && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
            <div className="mx-auto w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-5">
              <Crown className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Complete Your Subscription
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              You selected the <strong className="text-gray-900 dark:text-gray-100">{PLAN_LABELS[requestedPlan] || requestedPlan}</strong> plan. Complete your purchase to start using LoadMind Tracker.
            </p>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="w-full h-11 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {subscribing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                "Subscribe & Pay"
              )}
            </button>
            <button
              onClick={handleLogout}
              className="w-full mt-3 h-10 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
