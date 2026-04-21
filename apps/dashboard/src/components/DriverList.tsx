import { useState, useRef, useEffect } from "react";
import type { DriverLocationEntry } from "@/services/locations";
import { updateDriverName, removeDriverFromCompany } from "@/services/drivers";
import { createTrackingLink } from "@/services/trackingLinks";
import { useAuthStore } from "@/stores/auth";
import { type Trip, type User, timeAgo, distanceMeters, getFirstPickup, getLastDropoff } from "@nexus/shared";
import { toast } from "sonner";

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string) => void;
  activeDriverIds: Set<string>;
  trips: Trip[];
  newDriverIds?: Set<string>;
  onRefreshProfiles?: () => void;
  onCreateTrip?: (driverId: string) => void;
  onViewHistory?: (driverId: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
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
    { key: "assign", label: "Assign Trip" },
    { key: "history", label: "View History" },
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
  const name = profile?.displayName || profile?.phone || `Driver ${driver.driverId.slice(0, 6)}`;

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
              <p className="text-xs text-gray-500 dark:text-gray-400">{profile?.email ?? profile?.phone ?? "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Status", v: !c.isOnline ? "Offline" : hasActiveTrip ? "In Transit" : "Online" },
              { l: "Role", v: profile?.role ?? "driver" },
              { l: "Battery", v: `${Math.round(c.batteryLevel * 100)}%${c.isCharging ? " (Charging)" : ""}` },
              { l: "Speed", v: c.speed > 0 ? `${Math.round(c.speed * 2.237)} mph` : "Stationary" },
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
    } catch (err) {
      console.error("removeDriver error:", err);
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
  isNew,
  onSelect,
  hasActiveTrip,
  activeTrip,
  onRefreshProfiles,
  onCreateTrip,
  onViewHistory,
}: {
  driver: DriverLocationEntry;
  profile: User | undefined;
  isSelected: boolean;
  isNew: boolean;
  onSelect: () => void;
  hasActiveTrip: boolean;
  activeTrip: Trip | null;
  onRefreshProfiles: () => void;
  onCreateTrip: (driverId: string) => void;
  onViewHistory: (driverId: string) => void;
}) {
  const { userDoc } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const geocodedRef = useRef("");
  const c = driver.current;
  const name = profile?.displayName || profile?.phone || `Driver ${driver.driverId.slice(0, 6)}`;

  // Reverse geocode when selected
  useEffect(() => {
    if (!isSelected) return;
    const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
    if (geocodedRef.current === key) return;
    geocodedRef.current = key;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${c.lat}&lon=${c.lng}&format=json&zoom=10`)
      .then((r) => r.json())
      .then((data) => {
        const a = data.address;
        if (a) {
          const city = a.city || a.town || a.village || a.county || "";
          const state = a.state || "";
          const zip = a.postcode || "";
          const parts = [city, state].filter(Boolean).join(", ");
          setLocationLabel(parts + (zip ? ` ${zip}` : ""));
        }
      })
      .catch(() => {});
  }, [isSelected, c.lat, c.lng]);

  async function handleAction(action: string) {
    switch (action) {
      case "assign":
        onCreateTrip(driver.driverId);
        break;

      case "history":
        onViewHistory(driver.driverId);
        break;

      case "info":
        setInfoOpen(true);
        break;

      case "share": {
        if (!userDoc?.companyId || !activeTrip?.driverId) {
          toast.error("No active trip to share");
          return;
        }
        try {
          const { url, saved } = createTrackingLink(activeTrip.id, userDoc.companyId, activeTrip.driverId, userDoc.id);
          await navigator.clipboard.writeText(url);
          toast.success("Tracking link copied to clipboard");
          saved.catch((err) => console.error("Failed to save tracking link:", err));
        } catch (err: any) {
          console.error("Share tracking link error:", err);
          toast.error(`Failed: ${err?.message || err}`);
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
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        className={`relative p-3 mx-2 my-1 rounded-xl border transition-all cursor-pointer ${
          isSelected
            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800"
            : "bg-white dark:bg-gray-800/60 border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{name}</span>
            {isNew && (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 animate-pulse">
                New
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`w-2 h-2 rounded-full ${
              !c.isOnline ? "bg-red-500" : hasActiveTrip ? "bg-yellow-500" : "bg-green-500"
            }`} />
            <span
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-pointer transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </span>
          </div>
        </div>

        {/* Status + stats row */}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          <span className={`font-medium ${
            !c.isOnline ? "text-red-400" : hasActiveTrip ? "text-yellow-500" : "text-green-500"
          }`}>
            {!c.isOnline ? "Offline" : hasActiveTrip ? "In Transit" : "Active"}
          </span>
          <span>·</span>
          <span>{timeAgo(c.timestamp)}</span>
          <span>·</span>
          <span>{Math.round(c.batteryLevel * 100)}%{c.isCharging ? " ⚡" : ""}</span>
          <span>·</span>
          <span>{c.speed > 0 ? `${Math.round(c.speed * 2.237)} mph` : "Still"}</span>
        </div>

        {isSelected && locationLabel && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Current Location</p>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{locationLabel}</p>
            {c.speed > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 dark:text-gray-500">
                  <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                </svg>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{Math.round(c.speed * 2.237)} mph</span>
              </div>
            )}
          </div>
        )}

        {isSelected && activeTrip && (() => {
              const pickup = getFirstPickup(activeTrip);
              const dropoff = getLastDropoff(activeTrip);
              return (
              <div className="mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-700/50 space-y-1.5">
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
                {pickup && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 dark:text-gray-500">Pickup</span>
                    <span className="text-gray-600 dark:text-gray-300 ml-2 text-right">{pickup.label}</span>
                  </div>
                )}
                {dropoff && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 dark:text-gray-500">Drop-off</span>
                    <span className="text-gray-600 dark:text-gray-300 ml-2 text-right">{dropoff.label}</span>
                  </div>
                )}
                {(() => {
                  const useMiles = activeTrip.country === "us";
                  if (activeTrip.status === "accepted" && pickup) {
                    const m = distanceMeters(c.lat, c.lng, pickup.lat, pickup.lng);
                    return (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400 dark:text-gray-500">To pickup</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">{formatDist(m, useMiles)}</span>
                      </div>
                    );
                  }
                  if (activeTrip.status === "in_progress" && pickup && dropoff) {
                    const m = distanceMeters(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
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
              );
        })()}

        {menuOpen && (
          <OptionsMenu
            onAction={handleAction}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>

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
  newDriverIds,
  onRefreshProfiles,
  onCreateTrip,
  onViewHistory,
  mobileOpen,
  onMobileClose,
}: Props) {
  const onlineDrivers = drivers.filter((d) => d.current.isOnline);

  function getActiveTrip(driverId: string): Trip | null {
    return trips.find(
      (t) => t.driverId === driverId && (t.status === "accepted" || t.status === "in_progress")
    ) ?? null;
  }

  return (
    <div className={`${mobileOpen ? "flex fixed inset-0 z-40 w-full" : "hidden"} md:relative md:flex md:w-80 bg-white dark:bg-gray-900 md:border-l border-gray-200 dark:border-gray-700 flex-col overflow-hidden`}>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Drivers</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            {onlineDrivers.length} online
          </span>
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 text-xl leading-none"
              aria-label="Close drivers panel"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 py-1">
        {onlineDrivers.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No drivers online</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Drivers will appear here when they go online
            </p>
          </div>
        ) : (
          <div>
            {onlineDrivers.map((driver) => (
              <DriverCard
                key={driver.driverId}
                driver={driver}
                profile={driverProfiles.get(driver.driverId)}
                isSelected={selectedDriverId === driver.driverId}
                isNew={newDriverIds?.has(driver.driverId) ?? false}
                onSelect={() => onSelectDriver(driver.driverId)}
                hasActiveTrip={activeDriverIds.has(driver.driverId)}
                activeTrip={getActiveTrip(driver.driverId)}
                onRefreshProfiles={onRefreshProfiles ?? (() => {})}
                onCreateTrip={onCreateTrip ?? (() => {})}
                onViewHistory={onViewHistory ?? (() => {})}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
