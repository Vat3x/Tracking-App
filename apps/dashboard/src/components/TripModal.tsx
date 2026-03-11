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
}

interface LocationData {
  search: string;
  label: string;
  lat: number | null;
  lng: number | null;
  zipCode?: string;
}

const emptyLocation = (): LocationData => ({ search: "", label: "", lat: null, lng: null });

export default function TripModal({ open, onClose, driverProfiles, sidebar }: Props) {
  const { userDoc, firebaseUser } = useAuthStore();
  const { drivers } = useDriversStore();

  const [driverId, setDriverId] = useState("");
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
    setDriverId("");
    setCountry("us");
    setOrigin(emptyLocation());
    setDest(emptyLocation());
    setStops([]);
    setError("");
    onClose();
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const formContent = (
    <>
      {!sidebar && <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">New Trip</h2>}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={sidebar ? "space-y-3" : "space-y-4"} autoComplete="off">
          {/* Driver select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                className={inputCls}
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputCls}
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
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Origin</legend>
            <AddressSearch
              value={origin.search}
              country={country}
              placeholder="Search address, street, city, or zip..."
              onChange={(v) => setOrigin((prev) => ({ ...prev, search: v }))}
              onSelect={(r) => handleLocationSelect(setOrigin, r)}
              className={inputCls}
            />
            {origin.lat != null && (
              <p className="text-xs text-green-600 dark:text-green-400">{origin.label}</p>
            )}
          </fieldset>

          {/* Stops */}
          {stops.map((stop, i) => (
            <fieldset key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium text-orange-600 dark:text-orange-400">
                  Stop {i + 1}
                </legend>
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </div>
              <AddressSearch
                value={stop.search}
                country={country}
                placeholder={`Search stop ${i + 1} location...`}
                onChange={(v) =>
                  setStops((prev) => prev.map((s, j) => (j === i ? { ...s, search: v } : s)))
                }
                onSelect={(r) => handleStopSelect(i, r)}
                className={inputCls}
              />
              {stop.lat != null && (
                <p className="text-xs text-green-600 dark:text-green-400">{stop.label}</p>
              )}
            </fieldset>
          ))}

          {/* Add Stop button */}
          <button
            type="button"
            onClick={addStop}
            className="w-full py-2 px-4 border border-dashed border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
          >
            + Add Stop
          </button>

          {/* Destination (optional) */}
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Destination <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
            </legend>
            <AddressSearch
              value={dest.search}
              country={country}
              placeholder="Search address, street, city, or zip..."
              onChange={(v) => setDest((prev) => ({ ...prev, search: v }))}
              onSelect={(r) => handleLocationSelect(setDest, r)}
              className={inputCls}
            />
            {dest.lat != null && (
              <p className="text-xs text-green-600 dark:text-green-400">{dest.label}</p>
            )}
          </fieldset>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || driverOptions.length === 0}
              className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
