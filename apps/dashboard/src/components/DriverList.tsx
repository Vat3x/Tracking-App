import type { DriverLocationEntry } from "@/services/locations";
import type { User } from "@nexus/shared";

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string) => void;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function DriverCard({
  driver,
  profile,
  isSelected,
  onSelect,
}: {
  driver: DriverLocationEntry;
  profile: User | undefined;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const c = driver.current;
  const name = profile?.displayName ?? `Driver ${driver.driverId.slice(0, 6)}`;
  const isStale = Date.now() - c.timestamp > 50 * 60_000; // 50 min = stale

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 transition-colors ${
        isSelected
          ? "bg-blue-50 border-l-2 border-blue-500"
          : "hover:bg-gray-50 border-l-2 border-transparent"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
        <span
          className={`flex-shrink-0 w-2 h-2 rounded-full ${
            c.isOnline && !isStale ? "bg-green-500" : isStale ? "bg-yellow-500" : "bg-gray-400"
          }`}
        />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{c.isOnline ? (isStale ? "Stale" : "Online") : "Offline"}</span>
        <span>{formatTimeAgo(c.timestamp)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
        <span>{Math.round(c.batteryLevel * 100)}%{c.isCharging ? " ⚡" : ""}</span>
        <span>{c.speed > 0 ? `${Math.round(c.speed * 3.6)} km/h` : "Stationary"}</span>
      </div>
    </button>
  );
}

export default function DriverList({
  drivers,
  driverProfiles,
  selectedDriverId,
  onSelectDriver,
}: Props) {
  const onlineDrivers = drivers.filter((d) => d.current.isOnline);
  const offlineDrivers = drivers.filter((d) => !d.current.isOnline);

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Drivers</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {onlineDrivers.length} online · {offlineDrivers.length} offline
        </p>
      </div>

      {/* Driver list */}
      <div className="flex-1 overflow-y-auto">
        {drivers.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-400">No drivers yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Invite drivers to start tracking
            </p>
          </div>
        ) : (
          <>
            {onlineDrivers.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Online ({onlineDrivers.length})
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {onlineDrivers.map((driver) => (
                    <DriverCard
                      key={driver.driverId}
                      driver={driver}
                      profile={driverProfiles.get(driver.driverId)}
                      isSelected={selectedDriverId === driver.driverId}
                      onSelect={() => onSelectDriver(driver.driverId)}
                    />
                  ))}
                </div>
              </div>
            )}
            {offlineDrivers.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Offline ({offlineDrivers.length})
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {offlineDrivers.map((driver) => (
                    <DriverCard
                      key={driver.driverId}
                      driver={driver}
                      profile={driverProfiles.get(driver.driverId)}
                      isSelected={selectedDriverId === driver.driverId}
                      onSelect={() => onSelectDriver(driver.driverId)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
