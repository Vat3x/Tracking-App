import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { getCompanyDrivers } from "@/services/drivers";
import { getDriverHistory } from "@/services/locations";
import { subscribeToDriverTrips } from "@/services/trips";
import { logout } from "@/services/auth";
import HistoryMapView from "@/components/HistoryMapView";
import ThemeToggle from "@/components/ThemeToggle";
import {
  type Trip,
  type TripStatus,
  type User,
  type LocationHistory,
  getStopsFromTrip,
} from "@nexus/shared";

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

type DatePreset = "today" | "7d" | "30d" | "all";
type TripFilter = "all" | "completed" | "cancelled";

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

export default function DriverHistory() {
  const { driverId: paramDriverId } = useParams<{ driverId?: string }>();
  const { userDoc } = useAuthStore();
  const navigate = useNavigate();

  const [driverProfiles, setDriverProfiles] = useState<Map<string, User>>(new Map());
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(paramDriverId ?? null);
  const [datePreset, setDatePreset] = useState<DatePreset>("7d");
  const [tripFilter, setTripFilter] = useState<TripFilter>("all");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [history, setHistory] = useState<LocationHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Load driver profiles
  useEffect(() => {
    if (!userDoc?.companyId) return;
    getCompanyDrivers(userDoc.companyId).then(setDriverProfiles);
  }, [userDoc?.companyId]);

  // Subscribe to selected driver's trips
  useEffect(() => {
    if (!selectedDriverId) {
      setTrips([]);
      return;
    }
    return subscribeToDriverTrips(selectedDriverId, setTrips);
  }, [selectedDriverId]);

  // Fetch GPS history for selected driver
  useEffect(() => {
    if (!selectedDriverId || !userDoc?.companyId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    getDriverHistory(userDoc.companyId, selectedDriverId)
      .then(setHistory)
      .finally(() => setHistoryLoading(false));
  }, [selectedDriverId, userDoc?.companyId]);

  // Sync URL param to state
  useEffect(() => {
    if (paramDriverId && paramDriverId !== selectedDriverId) {
      setSelectedDriverId(paramDriverId);
    }
  }, [paramDriverId]);

  const dateRange = useMemo(() => getDateRange(datePreset), [datePreset]);

  const filteredHistory = useMemo(
    () => history.filter((h) => h.timestamp >= dateRange.start && h.timestamp <= dateRange.end),
    [history, dateRange]
  );

  const filteredTrips = useMemo(() => {
    let t = trips.filter((trip) => trip.createdAt >= dateRange.start && trip.createdAt <= dateRange.end);
    if (tripFilter === "completed") t = t.filter((trip) => trip.status === "completed");
    if (tripFilter === "cancelled") t = t.filter((trip) => ["cancelled", "rejected"].includes(trip.status));
    return t;
  }, [trips, dateRange, tripFilter]);

  const selectedTrip = useMemo(
    () => filteredTrips.find((t) => t.id === selectedTripId) ?? null,
    [filteredTrips, selectedTripId]
  );

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    await logout();
    navigate("/login");
  }

  const driverList = useMemo(() => Array.from(driverProfiles.entries()).sort((a, b) => a[1].displayName.localeCompare(b[1].displayName)), [driverProfiles]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
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
            onClick={() => navigate("/settings")}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Settings
          </button>
          <ThemeToggle />
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
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className="w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
          {/* Driver selector */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Driver</label>
            <select
              value={selectedDriverId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedDriverId(id);
                setSelectedTripId(null);
                if (id) navigate(`/history/${id}`, { replace: true });
                else navigate("/history", { replace: true });
              }}
              className="w-full h-9 px-3 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a driver...</option>
              {driverList.map(([id, profile]) => (
                <option key={id} value={id}>{profile.displayName}</option>
              ))}
            </select>
          </div>

          {/* Date range presets */}
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-1">
              {(["today", "7d", "30d", "all"] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setDatePreset(preset)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    datePreset === preset
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {preset === "today" ? "Today" : preset === "7d" ? "7 Days" : preset === "30d" ? "30 Days" : "All"}
                </button>
              ))}
            </div>
          </div>

          {selectedDriverId && (
            <>
              {/* Stats */}
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-4">
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{filteredTrips.length}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Trips</p>
                </div>
                <div className="w-px h-8 bg-gray-100 dark:bg-gray-700" />
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{filteredHistory.length}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">GPS Pings</p>
                </div>
              </div>

              {/* Trip filter tabs */}
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-1">
                  {(["all", "completed", "cancelled"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTripFilter(f)}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                        tripFilter === f
                          ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium shadow-sm border border-gray-200 dark:border-gray-700"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      {f === "all" ? "All" : f === "completed" ? "Completed" : "Cancelled"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trip list */}
              <div className="flex-1 overflow-y-auto">
                {filteredTrips.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">No trips found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filteredTrips.map((trip) => {
                      const isSelected = selectedTripId === trip.id;
                      return (
                        <button
                          key={trip.id}
                          onClick={() => setSelectedTripId(isSelected ? null : trip.id)}
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            isSelected
                              ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge status={trip.status} />
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
            </>
          )}

          {!selectedDriverId && (
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500">Select a driver to view history</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  GPS track and trip history will appear here
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {historyLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-gray-950/50">
              <p className="text-sm text-gray-500">Loading history...</p>
            </div>
          )}
          <HistoryMapView history={filteredHistory} selectedTrip={selectedTrip} />
        </div>
      </div>
    </div>
  );
}
