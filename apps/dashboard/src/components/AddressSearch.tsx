import { useState, useRef, useEffect } from "react";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    postcode?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

export interface AddressResult {
  label: string;
  lat: number;
  lng: number;
  zipCode?: string;
}

interface Props {
  value: string;
  country: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  className?: string;
  loading?: boolean;
}

function formatSuggestion(r: NominatimResult): string {
  const parts = r.display_name.split(", ");
  // Show first 3-4 meaningful parts for a readable label
  return parts.slice(0, 4).join(", ");
}

function extractLabel(r: NominatimResult): string {
  const a = r.address;
  if (!a) {
    const parts = r.display_name.split(", ");
    return parts.slice(0, 3).join(", ");
  }
  const city = a.city || a.town || a.village || "";
  const parts = [a.road, city, a.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : r.display_name.split(", ").slice(0, 3).join(", ");
}

export default function AddressSearch({
  value,
  country,
  placeholder = "Search address, street, or zip...",
  onChange,
  onSelect,
  className = "",
  loading: externalLoading,
}: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleInputChange(text: string) {
    onChange(text);

    clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchAddress(text.trim());
    }, 600);
  }

  async function searchAddress(query: string) {
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=${country}&format=json&addressdetails=1&limit=5`,
        { headers: { "User-Agent": "LoadMindTracker/1.0" } }
      );
      if (!res.ok) return;
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setShowDropdown(data.length > 0);
    } catch {
      // Silently fail
    } finally {
      setSearching(false);
    }
  }

  function handleSelect(result: NominatimResult) {
    setShowDropdown(false);
    setSuggestions([]);
    // Don't replace user's typed text — keep it as the label
    // Only pass coordinates back so the parent sets lat/lng
    onSelect({
      label: value.trim() || extractLabel(result),
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      zipCode: result.address?.postcode,
    });
  }

  const isLoading = searching || externalLoading;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
        />
        {isLoading && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500">...</span>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="block truncate">{formatSuggestion(s)}</span>
                {s.address?.postcode && (
                  <span className="block text-xs text-gray-400 dark:text-gray-500">{s.address.postcode}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
