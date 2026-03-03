import { useState, useRef, type FormEvent } from "react";
import { createTrip } from "@/services/trips";
import { useAuthStore } from "@/stores/auth";
import { useDriversStore } from "@/stores/drivers";
import { toast } from "sonner";
import type { User } from "@nexus/shared";

interface Props {
  open: boolean;
  onClose: () => void;
  driverProfiles: Map<string, User>;
}

export default function TripModal({ open, onClose, driverProfiles }: Props) {
  const { userDoc, firebaseUser } = useAuthStore();
  const { drivers } = useDriversStore();

  const [driverId, setDriverId] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [originLat, setOriginLat] = useState("");
  const [originLng, setOriginLng] = useState("");
  const [originZip, setOriginZip] = useState("");
  const [destLabel, setDestLabel] = useState("");
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");
  const [destZip, setDestZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zipLoading, setZipLoading] = useState<"origin" | "dest" | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  function debouncedLookupZip(
    zip: string,
    which: "origin" | "dest",
    setLabel: (v: string) => void,
    setLat: (v: string) => void,
    setLng: (v: string) => void
  ) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lookupZip(zip, which, setLabel, setLat, setLng);
    }, 600);
  }

  async function lookupZip(
    zip: string,
    which: "origin" | "dest",
    setLabel: (v: string) => void,
    setLat: (v: string) => void,
    setLng: (v: string) => void
  ) {
    const trimmed = zip.trim();
    if (trimmed.length < 3 || trimmed.length > 10) return;
    setZipLoading(which);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(trimmed)}&format=json&limit=1`,
        { headers: { "User-Agent": "NexusTracking/1.0" } }
      );
      if (!res.ok) {
        toast.error("Zip code not found");
        return;
      }
      const data = await res.json();
      if (data.length > 0) {
        const place = data[0];
        const parts = place.display_name.split(", ");
        const label = parts.slice(1, 3).join(", ") || parts[0];
        setLabel(label);
        setLat(place.lat);
        setLng(place.lon);
      } else {
        toast.error("Zip code not found");
      }
    } catch {
      toast.error("Failed to lookup zip code");
    } finally {
      setZipLoading(null);
    }
  }

  if (!open) return null;

  // Build driver options from RTDB drivers + Firestore profiles
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

  // Also include drivers from profiles that might not be online
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
    if (!originLabel || !originLat || !originLng) {
      setError("Enter an origin zip/postal code to auto-fill location");
      return;
    }
    if (!destLabel || !destLat || !destLng) {
      setError("Enter a destination zip/postal code to auto-fill location");
      return;
    }

    const lat1 = parseFloat(originLat);
    const lng1 = parseFloat(originLng);
    const lat2 = parseFloat(destLat);
    const lng2 = parseFloat(destLng);

    if ([lat1, lng1, lat2, lng2].some(isNaN)) {
      setError("Zip code lookup failed — coordinates missing");
      return;
    }

    setLoading(true);
    try {
      await createTrip({
        companyId: userDoc!.companyId!,
        driverId,
        assignedBy: firebaseUser!.uid,
        origin: { label: originLabel, lat: lat1, lng: lng1, ...(originZip && { zipCode: originZip }) },
        destination: { label: destLabel, lat: lat2, lng: lng2, ...(destZip && { zipCode: destZip }) },
      });
      toast.success("Trip created");
      handleClose();
    } catch {
      setError("Failed to create trip. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setDriverId("");
    setOriginLabel("");
    setOriginLat("");
    setOriginLng("");
    setOriginZip("");
    setDestLabel("");
    setDestLat("");
    setDestLng("");
    setDestZip("");
    setError("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">New Trip</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {/* Origin */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Origin</legend>
            <input
              type="text"
              placeholder="Location name (e.g. Warehouse A)"
              value={originLabel}
              onChange={(e) => setOriginLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="relative">
              <input
                type="text"
                placeholder="Zip / postal code"
                value={originZip}
                onChange={(e) => {
                  setOriginZip(e.target.value);
                  debouncedLookupZip(e.target.value, "origin", setOriginLabel, setOriginLat, setOriginLng);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {zipLoading === "origin" && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500">...</span>
              )}
            </div>
          </fieldset>

          {/* Destination */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Destination</legend>
            <input
              type="text"
              placeholder="Location name (e.g. Customer Site B)"
              value={destLabel}
              onChange={(e) => setDestLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="relative">
              <input
                type="text"
                placeholder="Zip / postal code"
                value={destZip}
                onChange={(e) => {
                  setDestZip(e.target.value);
                  debouncedLookupZip(e.target.value, "dest", setDestLabel, setDestLat, setDestLng);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {zipLoading === "dest" && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500">...</span>
              )}
            </div>
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
      </div>
    </div>
  );
}
