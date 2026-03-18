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
    () => Array.from(driverProfiles.entries()).sort((a, b) => a[1].displayName.localeCompare(b[1].displayName)),
    [driverProfiles]
  );

  const filteredTrips = useMemo(() => {
    let t = trips;
    if (selectedDriverId) t = t.filter((trip) => trip.driverId === selectedDriverId);
    if (filter === "active") t = t.filter((trip) => ["pending", "accepted", "in_progress"].includes(trip.status));
    else if (filter === "completed") t = t.filter((trip) => trip.status === "completed");
    else if (filter === "cancelled") t = t.filter((trip) => ["cancelled", "rejected"].includes(trip.status));
    return t;
  }, [trips, selectedDriverId, filter]);

  const selectedTrip = useMemo(
    () => filteredTrips.find((t) => t.id === selectedTripId) ?? null,
    [filteredTrips, selectedTripId]
  );

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
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Map
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

      {/* Main content: left panel + map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className="w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
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

          {/* Status filter tabs */}
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1">
            {(["all", "active", "completed", "cancelled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelectedTripId(null); }}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  filter === f
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
              {filteredTrips.length}
            </span>
          </div>

          {/* Trip list */}
          <div className="flex-1 overflow-y-auto">
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
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
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
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{driverName}</span>
                          <StatusBadge status={trip.status} />
                        </div>
                        {isActive && (
                          <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
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
                              className="text-[10px] text-green-500 hover:text-green-700 dark:hover:text-green-400"
                            >
                              Share
                            </button>
                            <button
                              onClick={() => setEditingTrip(trip)}
                              className="text-[10px] text-blue-500 hover:text-blue-700 dark:hover:text-blue-400"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleCancel(trip.id)}
                              className="text-[10px] text-gray-400 hover:text-red-500"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">
                        {formatTime(trip.createdAt)}
                        {trip.respondedAt && <> · Responded {formatTime(trip.respondedAt)}</>}
                      </p>
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
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <button
              onClick={() => navigate("/")}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Back to Map
            </button>
            <button
              onClick={() => setTripModalOpen(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              + New Trip
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
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
