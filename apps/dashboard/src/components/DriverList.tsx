import { useState, useRef, useEffect } from "react";
import type { DriverLocationEntry } from "@/services/locations";
import { updateDriverName, removeDriverFromCompany } from "@/services/drivers";
import { createInvite, generateInviteLink } from "@/services/invites";
import { useAuthStore } from "@/stores/auth";
import { type Trip, type User, timeAgo, distanceMeters } from "@nexus/shared";
import { toast } from "sonner";

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string) => void;
  activeDriverIds: Set<string>;
  trips: Trip[];
  onRefreshProfiles?: () => void;
}

function formatDist(meters: number, useMiles: boolean): string {
  if (useMiles) {
    const miles = meters / 1609.344;
    return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/* ─── Options dropdown ──────────────────────────────── */

function OptionsMenu({
  onAction,
  onClose,
}: {
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const items = [
    { key: "info", label: "Driver Info" },
    { key: "share", label: "Share tracking link" },
    { key: "edit", label: "Edit" },
    { key: "delete", label: "Delete", danger: true },
  ];

  return (
    <div
      ref={ref}
      className="absolute right-2 top-8 z-50 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1"
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={(e) => {
            e.stopPropagation();
            onAction(item.key);
            onClose();
          }}
          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
            item.danger
              ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Driver Info Modal ─────────────────────────────── */

function DriverInfoModal({
  profile,
  driver,
  hasActiveTrip,
  onClose,
}: {
  profile: User | undefined;
  driver: DriverLocationEntry;
  hasActiveTrip: boolean;
  onClose: () => void;
}) {
  const c = driver.current;
  const name = profile?.displayName ?? `Driver ${driver.driverId.slice(0, 6)}`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Driver Info</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
              {name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{profile?.email ?? "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Status", v: !c.isOnline ? "Offline" : hasActiveTrip ? "In Transit" : "Online" },
              { l: "Role", v: profile?.role ?? "driver" },
              { l: "Battery", v: `${Math.round(c.batteryLevel * 100)}%${c.isCharging ? " (Charging)" : ""}` },
              { l: "Speed", v: c.speed > 0 ? `${Math.round(c.speed * 3.6)} km/h` : "Stationary" },
              { l: "Last Sync", v: timeAgo(c.timestamp) },
              { l: "Heading", v: c.heading ? `${Math.round(c.heading)}°` : "—" },
            ].map(({ l, v }) => (
              <div key={l} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">{l}</p>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">{v}</p>
              </div>
            ))}
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Coordinates</p>
            <p className="text-xs font-mono text-gray-700 dark:text-gray-300">{c.lat.toFixed(5)}, {c.lng.toFixed(5)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Driver UID</p>
            <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{driver.driverId}</p>
          </div>
          {profile?.phone && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Phone</p>
              <p className="text-xs text-gray-700 dark:text-gray-300">{profile.phone}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Edit Driver Modal (Load Market style) ─────────── */

function EditDriverModal({
  profile,
  driverId,
  onClose,
  onSaved,
}: {
  profile: User | undefined;
  driverId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile?.displayName ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updateDriverName(driverId, trimmed);
      toast.success("Driver updated");
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to update driver");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[440px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {/* Header — like Load Market "Edit load" */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Driver</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Two-column row: Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Phone #
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 000-0000"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600"
              />
            </div>
          </div>

          {/* Driver UID (read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Driver UID</label>
            <input
              type="text"
              value={driverId}
              readOnly
              className="w-full px-3 py-2 text-sm border border-gray-100 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 font-mono cursor-default"
            />
          </div>

          {/* Tracking toggle — inspired by Load Market's "Include Real-Time Tracking Link" */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Tracking Settings</p>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">Real-Time Tracking</span>
              <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-green-500">
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm translate-x-[18px]" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">Stop Notifications</span>
              <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-green-500">
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm translate-x-[18px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer — Update button */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Driver Modal (two-step) ────────────────── */

function DeleteDriverModal({
  driverName,
  driverId,
  companyId,
  onClose,
  onDeleted,
}: {
  driverName: string;
  driverId: string;
  companyId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = confirmText.trim().toLowerCase() === driverName.trim().toLowerCase();

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    try {
      await removeDriverFromCompany(driverId, companyId);
      toast.success(`${driverName} removed`);
      onDeleted();
      onClose();
    } catch {
      toast.error("Failed to remove driver");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Remove Driver</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            This will remove <span className="font-semibold">{driverName}</span> from your company. They will lose access to all tracking data and trip assignments.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This action <span className="font-semibold text-red-600 dark:text-red-400">cannot be undone</span>.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Type <span className="font-semibold text-gray-900 dark:text-gray-100">"{driverName}"</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={driverName}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={!matches || deleting}
              className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {deleting ? "Removing..." : "Remove Driver"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Driver Card ───────────────────────────────────── */

function DriverCard({
  driver,
  profile,
  isSelected,
  onSelect,
  hasActiveTrip,
  activeTrip,
  onRefreshProfiles,
}: {
  driver: DriverLocationEntry;
  profile: User | undefined;
  isSelected: boolean;
  onSelect: () => void;
  hasActiveTrip: boolean;
  activeTrip: Trip | null;
  onRefreshProfiles: () => void;
}) {
  const { userDoc } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const c = driver.current;
  const name = profile?.displayName ?? `Driver ${driver.driverId.slice(0, 6)}`;

  async function handleAction(action: string) {
    switch (action) {
      case "info":
        setInfoOpen(true);
        break;

      case "share": {
        if (!userDoc?.companyId) return;
        try {
          const invite = await createInvite(userDoc.companyId, "LoadMind Tracker", userDoc.id);
          await navigator.clipboard.writeText(generateInviteLink(invite.id));
          toast.success("Tracking link copied to clipboard");
        } catch {
          toast.error("Failed to generate tracking link");
        }
        break;
      }

      case "edit":
        setEditOpen(true);
        break;

      case "delete":
        setDeleteOpen(true);
        break;
    }
  }

  return (
    <>
      <button
        onClick={onSelect}
        className={`relative w-full text-left px-4 py-3 transition-colors ${
          isSelected
            ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
            : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{name}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                !c.isOnline ? "bg-red-500" : hasActiveTrip ? "bg-yellow-500" : "bg-green-500"
              }`}
            />
            <span
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </span>
          </div>
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

        {menuOpen && (
          <OptionsMenu
            onAction={handleAction}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </button>

      {infoOpen && (
        <DriverInfoModal profile={profile} driver={driver} hasActiveTrip={hasActiveTrip} onClose={() => setInfoOpen(false)} />
      )}
      {editOpen && (
        <EditDriverModal profile={profile} driverId={driver.driverId} onClose={() => setEditOpen(false)} onSaved={onRefreshProfiles} />
      )}
      {deleteOpen && userDoc?.companyId && (
        <DeleteDriverModal
          driverName={name}
          driverId={driver.driverId}
          companyId={userDoc.companyId}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onRefreshProfiles}
        />
      )}
    </>
  );
}

/* ─── Main DriverList ───────────────────────────────── */

export default function DriverList({
  drivers,
  driverProfiles,
  selectedDriverId,
  onSelectDriver,
  activeDriverIds,
  trips,
  onRefreshProfiles,
}: Props) {
  const onlineDrivers = drivers.filter((d) => d.current.isOnline);

  function getActiveTrip(driverId: string): Trip | null {
    return trips.find(
      (t) => t.driverId === driverId && (t.status === "accepted" || t.status === "in_progress")
    ) ?? null;
  }

  return (
    <div className="w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Drivers</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {onlineDrivers.length} online
        </p>
      </div>

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
                onRefreshProfiles={onRefreshProfiles ?? (() => {})}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
