import { useState, type FormEvent } from "react";
import { createTrip } from "@/services/trips";
import { useAuthStore } from "@/stores/auth";
import { useDriversStore } from "@/stores/drivers";
import { toast } from "sonner";
import type { User } from "@nexus/shared";
import AddressSearch, { type AddressResult } from "./AddressSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  driverProfiles: Map<string, User>;
  sidebar?: boolean;
  defaultDriverId?: string;
}

interface LocationData {
  search: string;
  label: string;
  lat: number | null;
  lng: number | null;
  zipCode?: string;
}

const emptyLocation = (): LocationData => ({ search: "", label: "", lat: null, lng: null });

export default function TripModal({ open, onClose, driverProfiles, sidebar, defaultDriverId }: Props) {
  const { userDoc, firebaseUser } = useAuthStore();
  const { drivers } = useDriversStore();

  const [driverId, setDriverId] = useState(defaultDriverId ?? "");
  const [country, setCountry] = useState("us");
  const [origin, setOrigin] = useState<LocationData>(emptyLocation());
  const [dest, setDest] = useState<LocationData>(emptyLocation());
  const [stops, setStops] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleLocationSelect(
    setter: React.Dispatch<React.SetStateAction<LocationData>>,
    result: AddressResult
  ) {
    // Keep user's typed text as search/label, only fill coordinates
    setter((prev) => ({
      ...prev,
      label: prev.search.trim() || result.label,
      lat: result.lat,
      lng: result.lng,
      zipCode: result.zipCode,
    }));
  }

  function handleStopSelect(index: number, result: AddressResult) {
    setStops((prev) =>
      prev.map((s, i) =>
        i === index
          ? { ...s, label: s.search.trim() || result.label, lat: result.lat, lng: result.lng, zipCode: result.zipCode }
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

  if (!open) return null;

  const driverOptions: { id: string; name: string }[] = [];
  const seenIds = new Set<string>();

  drivers.forEach((d) => {
    seenIds.add(d.driverId);
    const profile = driverProfiles.get(d.driverId);
    driverOptions.push({
      id: d.driverId,
      name: profile?.displayName ?? `Driver ${d.driverId.slice(0, 6)}`,
    });
  });

  driverProfiles.forEach((profile, id) => {
    if (!seenIds.has(id)) {
      driverOptions.push({ id, name: profile.displayName });
    }
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!driverId) {
      setError("Select a driver");
      return;
    }
    if (!origin.label || origin.lat == null || origin.lng == null) {
      setError("Search and select an origin location");
      return;
    }

    // Validate stops
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (!s.label || s.lat == null || s.lng == null) {
        setError(`Stop ${i + 1}: search and select a location`);
        return;
      }
    }

    // Destination is optional
    const hasDest = !!(dest.label && dest.lat != null && dest.lng != null);

    const geoStops = stops.map((s) => ({
      label: s.label,
      lat: s.lat!,
      lng: s.lng!,
      ...(s.zipCode && { zipCode: s.zipCode }),
    }));

    setLoading(true);
    try {
      await createTrip({
        companyId: userDoc!.companyId!,
        driverId,
        assignedBy: firebaseUser!.uid,
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng, ...(origin.zipCode && { zipCode: origin.zipCode }) },
        ...(geoStops.length > 0 && { stops: geoStops }),
        ...(hasDest && { destination: { label: dest.label, lat: dest.lat!, lng: dest.lng!, ...(dest.zipCode && { zipCode: dest.zipCode }) } }),
        country,
      });
      toast.success("Trip created");
      handleClose();
    } catch (err) {
      console.error("Trip creation error:", err);
      setError("Failed to create trip. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setDriverId(defaultDriverId ?? "");
    setCountry("us");
    setOrigin(emptyLocation());
    setDest(emptyLocation());
    setStops([]);
    setError("");
    onClose();
  }

  const inputCls = "w-full px-3.5 py-2.5 border-0 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all";
  const selectCls = inputCls + " appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10";

  const formContent = (
    <>
      {!sidebar && <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">New Trip</h2>}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={sidebar ? "space-y-4" : "space-y-5"} autoComplete="off">
          {/* Driver select */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Assign to Driver
            </label>
            {driverOptions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                No drivers found. Invite drivers to your company first.
              </p>
            ) : (
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className={selectCls}
              >
                <option value="">Select a driver...</option>
                {driverOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Country */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={selectCls}
            >
              <option value="us">United States</option>
              <option value="ca">Canada</option>
              <option value="mx">Mexico</option>
              <option value="gb">United Kingdom</option>
              <option value="de">Germany</option>
              <option value="fr">France</option>
              <option value="es">Spain</option>
              <option value="it">Italy</option>
              <option value="pl">Poland</option>
              <option value="nl">Netherlands</option>
              <option value="ge">Georgia</option>
              <option value="tr">Turkey</option>
              <option value="ua">Ukraine</option>
              <option value="au">Australia</option>
              <option value="br">Brazil</option>
              <option value="in">India</option>
              <option value="jp">Japan</option>
              <option value="kr">South Korea</option>
              <option value="cn">China</option>
            </select>
          </div>

          {/* Origin */}
          <fieldset className="space-y-1.5 border-l-2 border-green-400 pl-3">
            <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C13 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/></svg>
              Pickup
            </legend>
            <AddressSearch
              value={origin.search}
              country={country}
              placeholder="Where should the driver pick up?"
              onChange={(v) => setOrigin((prev) => ({ ...prev, search: v }))}
              onSelect={(r) => handleLocationSelect(setOrigin, r)}
              className={inputCls}
            />
            {origin.lat != null && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                {origin.label}
              </p>
            )}
          </fieldset>

          {/* Stops */}
          {stops.map((stop, i) => (
            <fieldset key={i} className="space-y-1.5 border-l-2 border-orange-400 pl-3">
              <div className="flex items-center justify-between">
                <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-500 dark:text-orange-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                  Stop {i + 1}
                </legend>
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-400 font-medium"
                >
                  Remove
                </button>
              </div>
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
              {stop.lat != null && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                  {stop.label}
                </p>
              )}
            </fieldset>
          ))}

          {/* Add Stop button */}
          <button
            type="button"
            onClick={addStop}
            className="w-full py-2.5 px-4 border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-400 dark:text-gray-500 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all"
          >
            + Add Stop
          </button>

          {/* Destination (optional) */}
          <fieldset className="space-y-1.5 border-l-2 border-red-400 pl-3">
            <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-500 dark:text-red-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              Drop-off <span className="text-[10px] font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">(optional)</span>
            </legend>
            <AddressSearch
              value={dest.search}
              country={country}
              placeholder="Where should the driver deliver?"
              onChange={(v) => setDest((prev) => ({ ...prev, search: v }))}
              onSelect={(r) => handleLocationSelect(setDest, r)}
              className={inputCls}
            />
            {dest.lat != null && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                {dest.label}
              </p>
            )}
          </fieldset>

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 px-4 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || driverOptions.length === 0}
              className="flex-1 py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm shadow-blue-600/25 transition-all"
            >
              {loading ? "Creating..." : "Create Trip"}
            </button>
          </div>
        </form>
    </>
  );

  if (sidebar) {
    return (
      <>
        <div
          className="absolute inset-0 bg-black/10 z-20"
          onClick={handleClose}
        />
        <div className="absolute left-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-xl z-30 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">New Trip</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {formContent}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {formContent}
      </div>
    </div>
  );
}
