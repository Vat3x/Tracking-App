import { useState, useRef, useEffect } from "react";

const GOOGLE_MAPS_KEY = "AIzaSyCNzAjZeOqR_1bzGHb7zZEWhiyTFKX_Ju0";

let mapsLoaded = false;
let mapsLoading: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (mapsLoaded) return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => { mapsLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mapsLoading;
}

let autocompleteService: google.maps.places.AutocompleteService | null = null;
let placesService: google.maps.places.PlacesService | null = null;

async function getServices() {
  await loadGoogleMaps();
  if (!autocompleteService) {
    autocompleteService = new google.maps.places.AutocompleteService();
    placesService = new google.maps.places.PlacesService(document.createElement("div"));
  }
  return { autocompleteService, placesService: placesService! };
}

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
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

export default function AddressSearch({
  value,
  country,
  placeholder = "Search address, street, or zip...",
  onChange,
  onSelect,
  className = "",
  loading: externalLoading,
}: Props) {
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

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
    debounceRef.current = setTimeout(() => searchAddress(text.trim()), 400);
  }

  async function searchAddress(query: string) {
    setSearching(true);
    try {
      const { autocompleteService: svc } = await getServices();
      svc.getPlacePredictions(
        { input: query, componentRestrictions: { country } },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([]);
            setShowDropdown(false);
            setSearching(false);
            return;
          }
          const results: Prediction[] = predictions.map((p) => ({
            place_id: p.place_id,
            description: p.description,
            structured_formatting: {
              main_text: p.structured_formatting.main_text,
              secondary_text: p.structured_formatting.secondary_text,
            },
          }));
          setSuggestions(results);
          setShowDropdown(results.length > 0);
          setSearching(false);
        }
      );
    } catch {
      setSearching(false);
    }
  }

  async function handleSelect(prediction: Prediction) {
    setShowDropdown(false);
    setSuggestions([]);
    onChange(prediction.description);
    try {
      const { placesService: svc } = await getServices();
      svc.getDetails(
        { placeId: prediction.place_id, fields: ["geometry", "address_components"] },
        (place, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
          const zipComponent = place.address_components?.find((c) =>
            c.types.includes("postal_code")
          );
          onSelect({
            label: prediction.description,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            zipCode: zipComponent?.long_name,
          });
        }
      );
    } catch {
      // Silently fail — label is already set
    }
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
        <ul className="absolute z-50 w-full mt-1.5 bg-white dark:bg-gray-800 rounded-xl shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 max-h-48 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.place_id}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <span className="block truncate font-medium">{s.structured_formatting.main_text}</span>
                <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{s.structured_formatting.secondary_text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
