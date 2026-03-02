import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { useDriversStore } from "@/stores/drivers";
import { subscribeToCompanyTrips, updateTripStatus } from "@/services/trips";
import { getCompanyDrivers } from "@/services/drivers";
import { subscribeToCompanyLocations } from "@/services/locations";
import TripModal from "@/components/TripModal";
import { useNavigate } from "react-router-dom";
import { logout } from "@/services/auth";
import { toast } from "sonner";
import type { Trip, TripStatus, User } from "@nexus/shared";
import ThemeToggle from "@/components/ThemeToggle";

const STATUS_CONFIG: Record<TripStatus, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "bg-yellow-50 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400" },
  accepted: { label: "Accepted", bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  rejected: { label: "Rejected", bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  in_progress: { label: "In Progress", bg: "bg-indigo-50 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400" },
  completed: { label: "Completed", bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
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

export default function Trips() {
  const { userDoc } = useAuthStore();
  const { setDrivers } = useDriversStore();
  const navigate = useNavigate();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverProfiles, setDriverProfiles] = useState<Map<string, User>>(new Map());
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

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
    try {
      await updateTripStatus(tripId, "completed");
      toast.success("Trip cancelled");
    } catch {
      toast.error("Failed to cancel trip");
    }
  }

  const filteredTrips = trips.filter((t) => {
    if (filter === "active") return ["pending", "accepted", "in_progress"].includes(t.status);
    if (filter === "completed") return ["completed", "rejected"].includes(t.status);
    return true;
  });

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Nexus Tracking</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{userDoc?.displayName}</p>
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
            className="h-8 px-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Trip
          </button>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 mb-4">
            {(["all", "active", "completed"] as const).map((f) => (
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
                      {isActive && trip.status === "pending" && (
                        <button
                          onClick={() => handleCancel(trip.id)}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">Origin</p>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{trip.origin.label}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {trip.origin.lat.toFixed(4)}, {trip.origin.lng.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-gray-300 dark:text-gray-600 self-center">&rarr;</div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">Destination</p>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{trip.destination.label}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {trip.destination.lat.toFixed(4)}, {trip.destination.lng.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <TripModal
        open={tripModalOpen}
        onClose={() => setTripModalOpen(false)}
        driverProfiles={driverProfiles}
      />
    </div>
  );
}
