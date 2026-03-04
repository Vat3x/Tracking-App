import { useState, useRef, useEffect, type FormEvent } from "react";
import { updateTripLocation, type GeoPoint } from "@/services/trips";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  field: "origin" | "destination";
  currentLocation: GeoPoint;
  country: string;
}

export default function EditLocationModal({ open, onClose, tripId, field, currentLocation, country }: Props) {
  const [label, setLabel] = useState(currentLocation.label);
  const [lat, setLat] = useState(currentLocation.lat);
  const [lng, setLng] = useState(currentLocation.lng);
  const [zip, setZip] = useState(currentLocation.zipCode ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Reset state when modal opens with new data
  useEffect(() => {
    if (open) {
      setLabel(currentLocation.label);
      setLat(currentLocation.lat);
      setLng(currentLocation.lng);
      setZip(currentLocation.zipCode ?? "");
      setError("");
    }
  }, [open, tripId, field, currentLocation]);

  function debouncedLookupZip(zipValue: string) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => lookupZip(zipValue), 600);
  }

  async function lookupZip(zipValue: string) {
    const trimmed = zipValue.trim();
    if (trimmed.length < 3 || trimmed.length > 10) return;
    setZipLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(trimmed)}&countrycodes=${country}&format=json&limit=1`,
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
        const newLabel = parts.slice(1, 3).join(", ") || parts[0];
        setLabel(newLabel);
        setLat(parseFloat(place.lat));
        setLng(parseFloat(place.lon));
      } else {
        toast.error("Zip code not found");
      }
    } catch {
      toast.error("Failed to lookup zip code");
    } finally {
      setZipLoading(false);
    }
  }

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!label) {
      setError("Location name is required");
      return;
    }
    if (!lat || !lng) {
      setError("Enter a zip/postal code to auto-fill coordinates");
      return;
    }

    setLoading(true);
    try {
      await updateTripLocation(tripId, field, {
        label,
        lat,
        lng,
        ...(zip && { zipCode: zip }),
      });
      toast.success(`${field === "origin" ? "Origin" : "Destination"} updated`);
      onClose();
    } catch {
      setError("Failed to update location. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Edit {field === "origin" ? "Origin" : "Destination"}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Location name
            </label>
            <input
              type="text"
              placeholder="e.g. Warehouse A"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Zip / postal code
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Enter zip to auto-fill coordinates"
                value={zip}
                onChange={(e) => {
                  setZip(e.target.value);
                  debouncedLookupZip(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {zipLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500">...</span>
              )}
            </div>
            {lat && lng && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {lat.toFixed(4)}, {lng.toFixed(4)}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
