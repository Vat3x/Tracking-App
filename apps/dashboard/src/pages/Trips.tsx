import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/stores/auth";
import { useDriversStore } from "@/stores/drivers";
import { subscribeToCompanyTrips, updateTripStatus } from "@/services/trips";
import { getCompanyDrivers } from "@/services/drivers";
import { subscribeToCompanyLocations } from "@/services/locations";
import TripModal from "@/components/TripModal";
import EditTripModal from "@/components/EditTripModal";
import HistoryMapView from "@/components/HistoryMapView";
import { useTripNotifications } from "@/hooks/useTripNotifications";
import { useNavigate } from "react-router-dom";
import { logout } from "@/services/auth";
import { toast } from "sonner";
import { createTrackingLink } from "@/services/trackingLinks";
import { type Trip, type TripStatus, type User, getStopsFromTrip } from "@nexus/shared";
import ThemeToggle from "@/components/ThemeToggle";

const STATUS_CONFIG: Record<TripStatus, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "bg-yellow-50 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400" },
  accepted: { label: "Accepted", bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  rejected: { label: "Rejected", bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  in_progress: { label: "In Progress", bg: "bg-indigo-50 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400" },
  completed: { label: "Completed", bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  cancelled: { label: "Cancelled", bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
};

function StatusBadge({ status }: { status: TripStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type StatusFilter = "all" | "active" | "completed" | "cancelled";

export default function Trips() {
  const { userDoc } = useAuthStore();
  const { setDrivers } = useDriversStore();
  const navigate = useNavigate();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverProfiles, setDriverProfiles] = useState<Map<string, User>>(new Map());
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useTripNotifications(trips, driverProfiles);

  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToCompanyTrips(userDoc.companyId, setTrips);
  }, [userDoc?.companyId]);

  useEffect(() => {
    if (!userDoc?.companyId) return;
    getCompanyDrivers(userDoc.companyId).then(setDriverProfiles);
  }, [userDoc?.companyId]);

  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToCompanyLocations(userDoc.companyId, setDrivers);
  }, [userDoc?.companyId, setDrivers]);

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    await logout();
    navigate("/login");
  }

  async function handleCancel(tripId: string) {
    if (!window.confirm("Are you sure you want to cancel this trip?")) return;
    try {
      await updateTripStatus(tripId, "cancelled");
      toast.success("Trip cancelled");
    } catch {
      toast.error("Failed to cancel trip");
    }
  }

  const driverList = useMemo(
    () => Array.from(driverProfiles.entries()).sort((a, b) => (a[1].displayName ?? "").localeCompare(b[1].displayName ?? "")),
    [driverProfiles]
  );

  const filteredTrips = useMemo(() => {
    let t = trips;
    if (selectedDriverId) t = t.filter((trip) => trip.driverId === selectedDriverId);
    if (filter === "active") t = t.filter((trip) => ["pending", "accepted", "in_progress"].includes(trip.status));
    else if (filter === "completed") t = t.filter((trip) => trip.status === "completed");
    else if (filter === "cancelled") t = t.filter((trip) => ["cancelled", "rejected"].includes(trip.status));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      t = t.filter((trip) => {
        if (trip.name?.toLowerCase().includes(q)) return true;
        const driverName = driverProfiles.get(trip.driverId ?? "")?.displayName ?? "";
        if (driverName.toLowerCase().includes(q)) return true;
        return getStopsFromTrip(trip).some((s) => s.label.toLowerCase().includes(q));
      });
    }
    return t;
  }, [trips, selectedDriverId, filter, searchQuery, driverProfiles]);

  const selectedTrip = useMemo(
    () => filteredTrips.find((t) => t.id === selectedTripId) ?? null,
    [filteredTrips, selectedTripId]
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="relative bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="LoadMind" className="w-8 h-8" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">LoadMind Tracker</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{userDoc?.displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="h-8 px-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Dashboard
          </button>
          <button
            onClick={() => navigate("/history")}
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
            onClick={() => setTripModalOpen(true)}
            className="h-8 px-3 border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 text-sm font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            New Trip
          </button>
          </div>

          {/* Mobile back-to-dashboard + hamburger */}
          <button
            onClick={() => navigate("/")}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400"
            aria-label="Back to dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
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

        {mobileMenuOpen && (
          <>
            <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
            <div className="md:hidden absolute right-2 top-14 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
              <button
                onClick={() => { setMobileMenuOpen(false); setTripModalOpen(true); }}
                className="w-full text-left px-3 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                + New Trip
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMobileMenuOpen(false); navigate("/"); }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Dashboard
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); navigate("/history"); }}
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

      {/* Main content: left panel + map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className={`${selectedTripId ? "hidden md:flex" : "flex"} w-full md:w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-col shrink-0`}>
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Trips</h2>
            <button
              onClick={() => setTripModalOpen(true)}
              className="h-7 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              + New Trip
            </button>
          </div>

          {/* Driver selector */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Driver</label>
            <select
              value={selectedDriverId ?? ""}
              onChange={(e) => {
                setSelectedDriverId(e.target.value || null);
                setSelectedTripId(null);
              }}
              className="w-full h-9 px-3 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All drivers</option>
              {driverList.map(([id, profile]) => (
                <option key={id} value={id}>{profile.displayName}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedTripId(null); }}
                placeholder="Search trips..."
                className="w-full h-8 pl-8 pr-8 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1">
            {(["all", "active", "completed", "cancelled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelectedTripId(null); }}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  filter === f
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto font-medium">
              {filteredTrips.length}
            </span>
          </div>

          {/* Trip list */}
          <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
            {filteredTrips.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                  {trips.length === 0 ? "No trips yet" : `No ${filter === "all" ? "" : filter + " "}trips`}
                </p>
                {trips.length === 0 && (
                  <button
                    onClick={() => setTripModalOpen(true)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Create first trip
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {filteredTrips.map((trip) => {
                  const isSelected = selectedTripId === trip.id;
                  const driverName =
                    driverProfiles.get(trip.driverId ?? "")?.displayName ??
                    (trip.driverId ? `Driver ${trip.driverId.slice(0, 6)}` : "Unassigned");
                  const isActive = ["pending", "accepted", "in_progress"].includes(trip.status);

                  return (
                    <button
                      key={trip.id}
                      onClick={() => setSelectedTripId(isSelected ? null : trip.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800"
                          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
                      }`}
                    >
                      {trip.name && (
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate mb-1.5">{trip.name}</p>
                    )}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{driverName}</span>
                          <StatusBadge status={trip.status} />
                        </div>
                        {isActive && (
                          <div className="flex items-center gap-2.5 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={async () => {
                                if (!trip.driverId || !userDoc?.companyId || !userDoc?.id) return;
                                try {
                                  const { url, saved } = createTrackingLink(trip.id, userDoc.companyId, trip.driverId, userDoc.id);
                                  await navigator.clipboard.writeText(url);
                                  toast.success("Tracking link copied");
                                  saved.catch((err) => console.error("Failed to save tracking link:", err));
                                } catch (err: any) {
                                  toast.error(`Failed: ${err?.message || err}`);
                                }
                              }}
                              className="text-[11px] font-medium text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                            >
                              Share
                            </button>
                            <button
                              onClick={() => setEditingTrip(trip)}
                              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleCancel(trip.id)}
                              className="text-[11px] font-medium text-gray-400 hover:text-red-500"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                        {formatTime(trip.createdAt)}
                        {trip.respondedAt && <> · Responded {formatTime(trip.respondedAt)}</>}
                      </p>
                      <div className="space-y-1.5">
                        {getStopsFromTrip(trip).map((stop, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              stop.type === "pickup" ? "bg-green-500" : "bg-red-500"
                            }`} />
                            <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{stop.label}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => navigate("/")}
              className="w-full h-9 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Map */}
        <div className={`${selectedTripId ? "flex" : "hidden md:flex"} flex-1 relative`}>
          {selectedTripId && (
            <button
              onClick={() => setSelectedTripId(null)}
              className="md:hidden absolute top-3 left-3 z-20 h-9 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Back
            </button>
          )}
          <HistoryMapView history={[]} selectedTrip={selectedTrip} />
        </div>
      </div>

      {tripModalOpen && (
        <TripModal
          open={tripModalOpen}
          onClose={() => setTripModalOpen(false)}
          driverProfiles={driverProfiles}
          sidebar
        />
      )}

      {editingTrip && (
        <EditTripModal
          trip={editingTrip}
          driverProfile={driverProfiles.get(editingTrip.driverId ?? "")}
          onClose={() => setEditingTrip(null)}
        />
      )}
    </div>
  );
}
