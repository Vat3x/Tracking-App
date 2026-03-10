import type { DriverLocationEntry } from "@/services/locations";
import { type Trip, type User, timeAgo, distanceMeters } from "@nexus/shared";

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string) => void;
  activeDriverIds: Set<string>;
  trips: Trip[];
}

function formatDist(meters: number, useMiles: boolean): string {
  if (useMiles) {
    const miles = meters / 1609.344;
    return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function DriverCard({
  driver,
  profile,
  isSelected,
  onSelect,
  hasActiveTrip,
  activeTrip,
}: {
  driver: DriverLocationEntry;
  profile: User | undefined;
  isSelected: boolean;
  onSelect: () => void;
  hasActiveTrip: boolean;
  activeTrip: Trip | null;
}) {
  const c = driver.current;
  const name = profile?.displayName ?? `Driver ${driver.driverId.slice(0, 6)}`;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 transition-colors ${
        isSelected
          ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
          : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{name}</span>
        <span
          className={`flex-shrink-0 w-2 h-2 rounded-full ${
            !c.isOnline ? "bg-red-500" : hasActiveTrip ? "bg-yellow-500" : "bg-green-500"
          }`}
        />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span>{!c.isOnline ? "Inactive" : hasActiveTrip ? "In Transit" : "Active"}</span>
        <span>{timeAgo(c.timestamp)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-1">
        <span>{Math.round(c.batteryLevel * 100)}%{c.isCharging ? " ⚡" : ""}</span>
        <span>{c.speed > 0 ? `${Math.round(c.speed * 3.6)} km/h` : "Stationary"}</span>
      </div>

      {isSelected && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500">Coordinates</span>
            <span className="text-gray-600 dark:text-gray-300 font-mono">
              {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
            </span>
          </div>
          {c.heading !== undefined && c.heading > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 dark:text-gray-500">Heading</span>
              <span className="text-gray-600 dark:text-gray-300">{Math.round(c.heading)}°</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500">Last update</span>
            <span className="text-gray-600 dark:text-gray-300">
              {new Date(c.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500">Battery</span>
            <span className="text-gray-600 dark:text-gray-300">
              {Math.round(c.batteryLevel * 100)}%{c.isCharging ? " (Charging)" : ""}
            </span>
          </div>

          {/* Active trip details */}
          {activeTrip && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Active Trip</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  activeTrip.status === "accepted"
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                    : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                }`}>
                  {activeTrip.status === "accepted" ? "Accepted" : "In Progress"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 dark:text-gray-500">Origin</span>
                <span className="text-gray-600 dark:text-gray-300 truncate ml-2 max-w-[140px]">{activeTrip.origin.label}</span>
              </div>
              {activeTrip.destination && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 dark:text-gray-500">Destination</span>
                  <span className="text-gray-600 dark:text-gray-300 truncate ml-2 max-w-[140px]">{activeTrip.destination.label}</span>
                </div>
              )}
              {(() => {
                const useMiles = activeTrip.country === "us";
                if (activeTrip.status === "accepted") {
                  const m = distanceMeters(c.lat, c.lng, activeTrip.origin.lat, activeTrip.origin.lng);
                  return (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400 dark:text-gray-500">To pickup</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">{formatDist(m, useMiles)}</span>
                    </div>
                  );
                }
                if (activeTrip.status === "in_progress" && activeTrip.destination) {
                  const m = distanceMeters(activeTrip.origin.lat, activeTrip.origin.lng, activeTrip.destination.lat, activeTrip.destination.lng);
                  return (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400 dark:text-gray-500">Trip distance</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">{formatDist(m, useMiles)}</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

export default function DriverList({
  drivers,
  driverProfiles,
  selectedDriverId,
  onSelectDriver,
  activeDriverIds,
  trips,
}: Props) {
  const onlineDrivers = drivers.filter((d) => d.current.isOnline);

  function getActiveTrip(driverId: string): Trip | null {
    return trips.find(
      (t) => t.driverId === driverId && (t.status === "accepted" || t.status === "in_progress")
    ) ?? null;
  }

  return (
    <div className="w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Drivers</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {onlineDrivers.length} online
        </p>
      </div>

      {/* Driver list */}
      <div className="flex-1 overflow-y-auto">
        {onlineDrivers.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No drivers online</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Drivers will appear here when they go online
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {onlineDrivers.map((driver) => (
              <DriverCard
                key={driver.driverId}
                driver={driver}
                profile={driverProfiles.get(driver.driverId)}
                isSelected={selectedDriverId === driver.driverId}
                onSelect={() => onSelectDriver(driver.driverId)}
                hasActiveTrip={activeDriverIds.has(driver.driverId)}
                activeTrip={getActiveTrip(driver.driverId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
