import { useState, useEffect } from "react";
import { updateTripRoute } from "@/services/trips";
import { toast } from "sonner";
import AddressSearch, { type AddressResult } from "./AddressSearch";
import type { Trip, User, GeoPoint } from "@nexus/shared";

interface Props {
  trip: Trip;
  driverProfile: User | undefined;
  onClose: () => void;
}

interface LocationData {
  search: string;
  label: string;
  lat: number | null;
  lng: number | null;
  zipCode?: string;
}

function geoToLocation(geo: GeoPoint): LocationData {
  return {
    search: geo.label,
    label: geo.label,
    lat: geo.lat,
    lng: geo.lng,
    zipCode: geo.zipCode,
  };
}

const emptyLocation = (): LocationData => ({ search: "", label: "", lat: null, lng: null });

export default function EditTripModal({ trip, driverProfile, onClose }: Props) {
  const country = trip.country ?? "us";
  const driverName = driverProfile?.displayName ?? `Driver ${trip.driverId?.slice(0, 6) ?? "—"}`;
  const driverPhone = driverProfile?.phone ?? "";

  const [origin, setOrigin] = useState<LocationData>(geoToLocation(trip.origin));
  const [stops, setStops] = useState<LocationData[]>(
    (trip.stops ?? []).map(geoToLocation)
  );
  const [dest, setDest] = useState<LocationData>(
    trip.destination ? geoToLocation(trip.destination) : emptyLocation()
  );
  const [trackingLink, setTrackingLink] = useState(true);
  const [stopNotifs, setStopNotifs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset on trip change
  useEffect(() => {
    setOrigin(geoToLocation(trip.origin));
    setStops((trip.stops ?? []).map(geoToLocation));
    setDest(trip.destination ? geoToLocation(trip.destination) : emptyLocation());
    setError("");
  }, [trip.id]);

  function handleSelect(
    setter: React.Dispatch<React.SetStateAction<LocationData>>,
    result: AddressResult
  ) {
    setter((prev) => ({
      ...prev,
      search: result.label,
      label: result.label,
      lat: result.lat,
      lng: result.lng,
      zipCode: result.zipCode,
    }));
  }

  function handleStopSelect(index: number, result: AddressResult) {
    setStops((prev) =>
      prev.map((s, i) =>
        i === index
          ? { ...s, search: result.label, label: result.label, lat: result.lat, lng: result.lng, zipCode: result.zipCode }
          : s
      )
    );
  }

  function addStop() {
    setStops((prev) => [...prev, emptyLocation()]);
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpdate() {
    setError("");

    if (!origin.label || origin.lat == null || origin.lng == null) {
      setError("Origin must have a valid location");
      return;
    }

    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (!s.label || s.lat == null || s.lng == null) {
        setError(`Stop ${i + 1}: search and select a location`);
        return;
      }
    }

    const hasDest = !!(dest.label && dest.lat != null && dest.lng != null);

    const geoOrigin: GeoPoint = {
      label: origin.label,
      lat: origin.lat,
      lng: origin.lng,
      ...(origin.zipCode && { zipCode: origin.zipCode }),
    };

    const geoStops: GeoPoint[] = stops.map((s) => ({
      label: s.label,
      lat: s.lat!,
      lng: s.lng!,
      ...(s.zipCode && { zipCode: s.zipCode }),
    }));

    const geoDest: GeoPoint | null = hasDest
      ? { label: dest.label, lat: dest.lat!, lng: dest.lng!, ...(dest.zipCode && { zipCode: dest.zipCode }) }
      : null;

    setSaving(true);
    try {
      await updateTripRoute(trip.id, geoOrigin, geoStops, geoDest);
      toast.success("Trip updated");
      onClose();
    } catch {
      setError("Failed to update trip. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  // Count total numbered stops: origin(#1) + stops(#2..N) + dest(#N+1 if present)
  let stopNum = 1;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-[520px] max-w-[95vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Trip</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">
            &times;
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Driver info row — like Load Market's top row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Driver</label>
              <div className="px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100">
                {driverName}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Phone #</label>
              <div className="px-3 py-2 text-sm bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-400">
                {driverPhone || "—"}
              </div>
            </div>
          </div>

          {/* Pick-up/Drop-off stops */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Pick-up/Drop-off stops</h4>

            <div className="space-y-3">
              {/* Origin — always #1 */}
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mt-2.5 w-5 shrink-0">
                  #{stopNum++}
                </span>
                <div className="flex-1 relative">
                  <AddressSearch
                    value={origin.search}
                    country={country}
                    placeholder="Origin address..."
                    onChange={(v) => setOrigin((prev) => ({ ...prev, search: v }))}
                    onSelect={(r) => handleSelect(setOrigin, r)}
                    className={inputCls}
                  />
                  {origin.lat != null && origin.label !== origin.search && (
                    <p className="text-[11px] text-green-600 dark:text-green-400 mt-0.5 px-1">{origin.label}</p>
                  )}
                </div>
              </div>

              {/* Intermediate stops */}
              {stops.map((stop, i) => {
                const num = stopNum++;
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mt-2.5 w-5 shrink-0">
                      #{num}
                    </span>
                    <div className="flex-1 relative">
                      <AddressSearch
                        value={stop.search}
                        country={country}
                        placeholder={`Stop ${i + 1} address...`}
                        onChange={(v) =>
                          setStops((prev) => prev.map((s, j) => (j === i ? { ...s, search: v } : s)))
                        }
                        onSelect={(r) => handleStopSelect(i, r)}
                        className={inputCls}
                      />
                      {stop.lat != null && stop.label !== stop.search && (
                        <p className="text-[11px] text-green-600 dark:text-green-400 mt-0.5 px-1">{stop.label}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStop(i)}
                      className="mt-2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors shrink-0"
                      title="Remove stop"
                    >
                      &minus;
                    </button>
                  </div>
                );
              })}

              {/* Destination */}
              {(dest.search || dest.lat != null) && (
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mt-2.5 w-5 shrink-0">
                    #{stopNum++}
                  </span>
                  <div className="flex-1 relative">
                    <AddressSearch
                      value={dest.search}
                      country={country}
                      placeholder="Destination address..."
                      onChange={(v) => setDest((prev) => ({ ...prev, search: v }))}
                      onSelect={(r) => handleSelect(setDest, r)}
                      className={inputCls}
                    />
                    {dest.lat != null && dest.label !== dest.search && (
                      <p className="text-[11px] text-green-600 dark:text-green-400 mt-0.5 px-1">{dest.label}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDest(emptyLocation())}
                    className="mt-2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors shrink-0"
                    title="Remove destination"
                  >
                    &minus;
                  </button>
                </div>
              )}

              {/* Add Stop / Add Destination */}
              <div className="flex gap-2 pl-7">
                <button
                  type="button"
                  onClick={addStop}
                  className="px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  + Add Stop
                </button>
                {!dest.search && dest.lat == null && (
                  <button
                    type="button"
                    onClick={() => setDest({ ...emptyLocation(), search: " " })}
                    className="px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    + Add Destination
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Toggles — matching Load Market style */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Include Real-Time Tracking Link</span>
              <button
                type="button"
                onClick={() => setTrackingLink(!trackingLink)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  trackingLink ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    trackingLink ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Arrived/Completed Stop Notifications</span>
              <button
                type="button"
                onClick={() => setStopNotifs(!stopNotifs)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  stopNotifs ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    stopNotifs ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer — Update button */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end shrink-0">
          <button
            onClick={handleUpdate}
            disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Updating..." : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
