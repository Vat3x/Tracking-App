import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { useDriversStore } from "@/stores/drivers";
import { subscribeToCompanyTrips, updateTripStatus } from "@/services/trips";
import { getCompanyDrivers } from "@/services/drivers";
import { subscribeToCompanyLocations } from "@/services/locations";
import TripModal from "@/components/TripModal";
import EditTripModal from "@/components/EditTripModal";
import { useTripNotifications } from "@/hooks/useTripNotifications";
import { useNavigate } from "react-router-dom";
import { logout } from "@/services/auth";
import { toast } from "sonner";
import { createTrackingLink, generateTrackingUrl } from "@/services/trackingLinks";
import { type Trip, type TripStatus, type User, distanceMeters, getStopsFromTrip, getFirstPickup, getLastDropoff } from "@nexus/shared";
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

function formatDistance(meters: number, useMiles: boolean): string {
  if (useMiles) {
    const miles = meters / 1609.344;
    return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export default function Trips() {
  const { userDoc } = useAuthStore();
  const { drivers, setDrivers } = useDriversStore();
  const navigate = useNavigate();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverProfiles, setDriverProfiles] = useState<Map<string, User>>(new Map());
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Toast notifications for trip status changes
  useTripNotifications(trips, driverProfiles);

  // Subscribe to trips
  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToCompanyTrips(userDoc.companyId, setTrips);
  }, [userDoc?.companyId]);

  // Load driver profiles
  useEffect(() => {
    if (!userDoc?.companyId) return;
    getCompanyDrivers(userDoc.companyId).then(setDriverProfiles);
  }, [userDoc?.companyId]);

  // Subscribe to driver locations (for TripModal driver list)
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

  const filteredTrips = trips.filter((t) => {
    if (filter === "active") return ["pending", "accepted", "in_progress"].includes(t.status);
    if (filter === "completed") return t.status === "completed";
    if (filter === "cancelled") return ["cancelled", "rejected"].includes(t.status);
    return true;
  });

  return (
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
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Map
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

      <div className="flex-1 overflow-hidden relative">
      <main className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 mb-4">
            {(["all", "active", "completed", "cancelled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  filter === f
                    ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium shadow-sm border border-gray-200 dark:border-gray-700"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
              {filteredTrips.length} trip{filteredTrips.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Trip list */}
          {filteredTrips.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl py-16 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {filter === "all" ? "No trips yet" : `No ${filter} trips`}
              </p>
              <button
                onClick={() => setTripModalOpen(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Create first trip
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTrips.map((trip) => {
                const driverName =
                  driverProfiles.get(trip.driverId ?? "")?.displayName ??
                  (trip.driverId ? `Driver ${trip.driverId.slice(0, 6)}` : "Unassigned");
                const isActive = ["pending", "accepted", "in_progress"].includes(trip.status);

                const useMiles = trip.country === "us";
                const pickup = getFirstPickup(trip);
                const dropoff = getLastDropoff(trip);
                let distanceLabel: string | null = null;
                if (trip.status === "accepted" && trip.driverId && pickup) {
                  const driverLoc = drivers.find((d) => d.driverId === trip.driverId);
                  if (driverLoc) {
                    const m = distanceMeters(driverLoc.current.lat, driverLoc.current.lng, pickup.lat, pickup.lng);
                    distanceLabel = `${formatDistance(m, useMiles)} to pickup`;
                  }
                } else if (trip.status === "in_progress" && pickup && dropoff) {
                  const m = distanceMeters(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
                  distanceLabel = `${formatDistance(m, useMiles)} trip distance`;
                }

                return (
                  <div
                    key={trip.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{driverName}</span>
                          <StatusBadge status={trip.status} />
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Created {formatTime(trip.createdAt)}
                          {trip.respondedAt && <> · Responded {formatTime(trip.respondedAt)}</>}
                        </p>
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              if (!trip.driverId || !userDoc?.companyId || !userDoc?.id) return;
                              try {
                                const linkId = await createTrackingLink(trip.id, userDoc.companyId, trip.driverId, userDoc.id);
                                await navigator.clipboard.writeText(generateTrackingUrl(linkId));
                                toast.success("Tracking link copied to clipboard");
                              } catch {
                                toast.error("Failed to generate tracking link");
                              }
                            }}
                            className="text-xs text-green-500 hover:text-green-700 dark:hover:text-green-400"
                          >
                            Share
                          </button>
                          <button
                            onClick={() => setEditingTrip(trip)}
                            className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-400"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleCancel(trip.id)}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Route stops */}
                    <div className="space-y-2">
                      {getStopsFromTrip(trip).map((stop, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                            stop.type === "pickup" ? "bg-green-500" : "bg-red-500"
                          }`} />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{stop.label}</p>
                            {stop.note && (
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{stop.note}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {distanceLabel && (
                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          {distanceLabel}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

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
    </div>
  );
}
