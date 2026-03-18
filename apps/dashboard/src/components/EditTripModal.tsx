import { useState, useEffect } from "react";
import { updateTripRoute } from "@/services/trips";
import { toast } from "sonner";
import AddressSearch, { type AddressResult } from "./AddressSearch";
import type { Trip, User, TripStop } from "@nexus/shared";
import { getStopsFromTrip } from "@nexus/shared";

interface Props {
  trip: Trip;
  driverProfile: User | undefined;
  onClose: () => void;
}

interface StopData {
  id: string;
  type: "pickup" | "dropoff";
  search: string;
  label: string;
  lat: number | null;
  lng: number | null;
  zipCode?: string;
  note: string;
}

let stopIdCounter = 0;
const emptyStop = (type: "pickup" | "dropoff"): StopData => ({
  id: `es-${++stopIdCounter}`,
  type,
  search: "",
  label: "",
  lat: null,
  lng: null,
  note: "",
});

function tripStopToData(s: TripStop): StopData {
  return {
    id: `es-${++stopIdCounter}`,
    type: s.type,
    search: s.label,
    label: s.label,
    lat: s.lat,
    lng: s.lng,
    zipCode: s.zipCode,
    note: s.note ?? "",
  };
}

export default function EditTripModal({ trip, driverProfile, onClose }: Props) {
  const country = trip.country ?? "us";
  const driverName = driverProfile?.displayName || driverProfile?.phone || `Driver ${trip.driverId?.slice(0, 6) ?? "—"}`;
  const driverPhone = driverProfile?.phone ?? "";

  const [stops, setStops] = useState<StopData[]>(() =>
    getStopsFromTrip(trip).map(tripStopToData)
  );
  const [trackingLink, setTrackingLink] = useState(true);
  const [stopNotifs, setStopNotifs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset on trip change
  useEffect(() => {
    setStops(getStopsFromTrip(trip).map(tripStopToData));
    setError("");
  }, [trip.id]);

  function updateStop(index: number, updates: Partial<StopData>) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function handleStopSelect(index: number, result: AddressResult) {
    updateStop(index, {
      search: result.label,
      label: result.label,
      lat: result.lat,
      lng: result.lng,
      zipCode: result.zipCode,
    });
  }

  function addStop() {
    setStops((prev) => [...prev, emptyStop("pickup")]);
  }

  function removeStop(index: number) {
    if (stops.length <= 2) return;
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpdate() {
    setError("");

    if (stops.length < 2) {
      setError("At least 2 stops required");
      return;
    }
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (!s.label || s.lat == null || s.lng == null) {
        setError(`Stop ${i + 1}: search and select a location`);
        return;
      }
    }

    setSaving(true);
    try {
      await updateTripRoute(
        trip.id,
        stops.map((s) => ({
          type: s.type,
          label: s.label,
          lat: s.lat!,
          lng: s.lng!,
          ...(s.zipCode && { zipCode: s.zipCode }),
          ...(s.note.trim() && { note: s.note.trim() }),
        }))
      );
      toast.success("Trip updated");
      onClose();
    } catch {
      setError("Failed to update trip. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3.5 py-2.5 border-0 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all";

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
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Driver info row */}
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

          {/* Stops */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C13 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/></svg>
              Route
            </label>

            <div className="space-y-3">
              {stops.map((stop, i) => {
                const isPickup = stop.type === "pickup";
                const borderColor = isPickup ? "border-green-400" : "border-red-400";

                return (
                  <fieldset key={stop.id} className={`space-y-1.5 border-l-2 ${borderColor} pl-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">
                          #{i + 1}
                        </span>
                        <div className="flex rounded-lg overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
                          <button
                            type="button"
                            onClick={() => updateStop(i, { type: "pickup" })}
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                              isPickup
                                ? "bg-green-500 text-white"
                                : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                            }`}
                          >
                            Pickup
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStop(i, { type: "dropoff" })}
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                              !isPickup
                                ? "bg-red-500 text-white"
                                : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                            }`}
                          >
                            Drop-off
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!stop.note && (
                          <button
                            type="button"
                            onClick={() => updateStop(i, { note: " " })}
                            className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                          >
                            + Note
                          </button>
                        )}
                        {stops.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeStop(i)}
                            className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-400 font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <AddressSearch
                      value={stop.search}
                      country={country}
                      placeholder={isPickup ? "Pickup address..." : "Drop-off address..."}
                      onChange={(v) => updateStop(i, { search: v })}
                      onSelect={(r) => handleStopSelect(i, r)}
                      className={inputCls}
                    />
                    {stop.lat != null && (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                        {stop.label}
                      </p>
                    )}
                    {stop.note && (
                      <input
                        type="text"
                        value={stop.note}
                        onChange={(e) => updateStop(i, { note: e.target.value })}
                        placeholder="Note..."
                        autoFocus
                        className="w-full px-2.5 py-1 text-[11px] bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 rounded border-0 ring-1 ring-gray-100 dark:ring-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all"
                      />
                    )}
                  </fieldset>
                );
              })}
            </div>

            {/* Add Stop button */}
            <button
              type="button"
              onClick={addStop}
              className="w-full mt-3 py-2.5 px-4 border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-400 dark:text-gray-500 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all"
            >
              + Add Stop
            </button>
          </div>

          {/* Toggles */}
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

        {/* Footer */}
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
