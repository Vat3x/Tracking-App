import { useState, useEffect, type FormEvent } from "react";
import { updateTripLocation } from "@/services/trips";
import type { GeoPoint } from "@nexus/shared";
import { toast } from "sonner";
import AddressSearch from "./AddressSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  field: "origin" | "destination";
  currentLocation: GeoPoint;
  country: string;
}

export default function EditLocationModal({ open, onClose, tripId, field, currentLocation, country }: Props) {
  const [search, setSearch] = useState(currentLocation.label);
  const [label, setLabel] = useState(currentLocation.label);
  const [lat, setLat] = useState<number | null>(currentLocation.lat);
  const [lng, setLng] = useState<number | null>(currentLocation.lng);
  const [zipCode, setZipCode] = useState(currentLocation.zipCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset state when modal opens with new data
  useEffect(() => {
    if (open) {
      setSearch(currentLocation.label);
      setLabel(currentLocation.label);
      setLat(currentLocation.lat);
      setLng(currentLocation.lng);
      setZipCode(currentLocation.zipCode);
      setError("");
    }
  }, [open, tripId, field, currentLocation]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!label || lat == null || lng == null) {
      setError("Search and select a location");
      return;
    }

    setLoading(true);
    try {
      await updateTripLocation(tripId, field, {
        label,
        lat,
        lng,
        ...(zipCode && { zipCode }),
      });
      toast.success(`${field === "origin" ? "Origin" : "Destination"} updated`);
      onClose();
    } catch {
      setError("Failed to update location. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

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
              Search location
            </label>
            <AddressSearch
              value={search}
              country={country}
              placeholder="Search address, street, city, or zip..."
              onChange={setSearch}
              onSelect={(r) => {
                setLabel(search.trim() || r.label);
                setLat(r.lat);
                setLng(r.lng);
                setZipCode(r.zipCode);
              }}
              className={inputCls}
            />
            {lat != null && lng != null && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">{label}</p>
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
