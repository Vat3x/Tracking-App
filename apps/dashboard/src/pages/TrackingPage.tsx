import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const POLL_INTERVAL = 30_000;
const FUNCTIONS_BASE = "https://us-central1-tracking-app-f6ad7.cloudfunctions.net";
const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

interface TripStop {
  type: "pickup" | "dropoff";
  label: string;
  lat: number;
  lng: number;
  note?: string;
}

interface DriverLocation {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: number;
  isOnline: boolean;
}

interface TrackingData {
  status: string;
  stops: TripStop[];
  country: string;
  currentStopIndex: number;
  driverName: string;
  driverLocation: DriverLocation | null;
}

interface RouteInfo {
  coordinates: [number, number][];
  distance: number;
  duration: number;
}

// --- Helpers ---

async function fetchRoute(waypoints: [number, number][]): Promise<RouteInfo | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  try {
    const res = await fetch(`${OSRM_BASE}/${coords}?overview=full&geometries=geojson`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    return { coordinates: route.geometry.coordinates, distance: route.distance, duration: route.duration };
  } catch {
    return null;
  }
}

function formatETA(seconds: number): string {
  if (seconds < 3600) return `~${Math.round(seconds / 60)} min`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `~${hrs} hr ${mins} min`;
}

function formatDistance(meters: number, useMiles: boolean): string {
  if (useMiles) {
    const miles = meters / 1609.34;
    return miles < 0.1 ? `${Math.round(meters * 3.281)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Awaiting Driver", color: "#ca8a04", bg: "#fef9c3" },
  accepted: { label: "En Route to Pickup", color: "#2563eb", bg: "#dbeafe" },
  in_progress: { label: "In Transit", color: "#4f46e5", bg: "#e0e7ff" },
  completed: { label: "Delivered", color: "#16a34a", bg: "#dcfce7" },
  cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fee2e2" },
  rejected: { label: "Declined", color: "#dc2626", bg: "#fee2e2" },
};

function createStopMarker(color: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:24px;height:24px;overflow:visible;";
  const inner = document.createElement("div");
  inner.style.cssText = `width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);`;
  inner.title = label;
  el.appendChild(inner);
  return el;
}

function createDriverMarker(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:36px;height:36px;overflow:visible;";
  const inner = document.createElement("div");
  inner.style.cssText = "width:36px;height:36px;display:flex;align-items:center;justify-content:center;";
  inner.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="6" width="18" height="10" rx="2" fill="#3b82f6" stroke="#fff" stroke-width="1.5"/>
    <rect x="1" y="12" width="4" height="4" rx="1" fill="#3b82f6" stroke="#fff" stroke-width="1"/>
    <circle cx="7.5" cy="17" r="2" fill="#1e40af" stroke="#fff" stroke-width="1"/>
    <circle cx="16.5" cy="17" r="2" fill="#1e40af" stroke="#fff" stroke-width="1"/>
    <rect x="14" y="7" width="6" height="5" rx="1" fill="#93c5fd"/>
  </svg>`;
  el.appendChild(inner);
  return el;
}

// --- Component ---

export default function TrackingPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteInfo | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const prevDriverPos = useRef<{ lat: number; lng: number } | null>(null);
  const initialFit = useRef(false);

  // System dark mode
  const [isDark, setIsDark] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Fetch tracking data
  const fetchData = useCallback(async () => {
    if (!linkId) return;
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/getTrackingData?linkId=${encodeURIComponent(linkId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Link not found or expired");
        return;
      }
      const json: TrackingData = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Unable to load tracking data. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Init map (depends on loading — container doesn't exist while loading)
  useEffect(() => {
    if (loading || !mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
      center: [-98.5, 39.8], // US center
      zoom: 4,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [loading]);

  // Switch map tiles when system dark mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);
  }, [isDark]);

  // Update map markers + route when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    // Driver marker
    if (data.driverLocation) {
      const { lat, lng } = data.driverLocation;
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new maplibregl.Marker({ element: createDriverMarker() })
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        driverMarkerRef.current.setLngLat([lng, lat]);
      }
    }

    // Stop markers
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];
    data.stops.forEach((stop) => {
      const color = stop.type === "pickup" ? "#22c55e" : "#ef4444";
      const marker = new maplibregl.Marker({ element: createStopMarker(color, stop.label) })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });

    // Fit bounds on first load
    if (!initialFit.current && (data.driverLocation || data.stops.length > 0)) {
      initialFit.current = true;
      const bounds = new maplibregl.LngLatBounds();
      if (data.driverLocation) bounds.extend([data.driverLocation.lng, data.driverLocation.lat]);
      data.stops.forEach((s) => bounds.extend([s.lng, s.lat]));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      }
    }

    // Fetch route (only if driver has moved significantly or first time)
    const driverLoc = data.driverLocation;
    if (driverLoc && data.stops.length > 0) {
      const prev = prevDriverPos.current;
      const moved = !prev || Math.abs(prev.lat - driverLoc.lat) > 0.003 || Math.abs(prev.lng - driverLoc.lng) > 0.003;
      if (moved) {
        prevDriverPos.current = { lat: driverLoc.lat, lng: driverLoc.lng };
        // Build waypoints: driver → relevant stops
        const waypoints: [number, number][] = [[driverLoc.lng, driverLoc.lat]];
        const idx = data.currentStopIndex ?? 0;
        const relevantStops = data.status === "accepted"
          ? [data.stops[0]] // en route to first pickup
          : data.stops.slice(idx); // remaining stops
        relevantStops.forEach((s) => {
          if (s) waypoints.push([s.lng, s.lat]);
        });
        fetchRoute(waypoints).then((r) => setRoute(r));
      }
    }
  }, [data]);

  // Draw route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const drawRoute = () => {
      // Clean up existing
      try {
        if (map.getLayer("track-route-line")) map.removeLayer("track-route-line");
        if (map.getSource("track-route")) map.removeSource("track-route");
      } catch { /* ignore */ }

      if (!route) return;

      const isDashed = data.status === "accepted";

      map.addSource("track-route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: route.coordinates }, properties: {} },
      });

      map.addLayer({
        id: "track-route-line",
        type: "line",
        source: "track-route",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 4,
          "line-opacity": 0.8,
          ...(isDashed ? { "line-dasharray": [2, 2] } : {}),
        },
      });
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once("idle", drawRoute);
    }
  }, [route, data?.status]);

  // --- Render ---

  const bg = isDark ? "#0f172a" : "#f8fafc";
  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const textPrimary = isDark ? "#f1f5f9" : "#1e293b";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const borderColor = isDark ? "#334155" : "#e2e8f0";

  if (loading) {
    return (
      <div style={{ ...pageStyle, background: bg, color: textPrimary, justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#3b82f6", marginBottom: 8 }}>LoadMind Tracker</div>
          <div style={{ color: textSecondary }}>Loading tracking data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...pageStyle, background: bg, color: textPrimary, justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", padding: 24, background: cardBg, borderRadius: 12, maxWidth: 400, boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#3b82f6", marginBottom: 16 }}>LoadMind Tracker</div>
          <div style={{ fontSize: 16, color: "#ef4444", marginBottom: 8 }}>{error}</div>
          <div style={{ fontSize: 13, color: textSecondary }}>This link may have expired or the trip has ended.</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const statusInfo = STATUS_CONFIG[data.status] ?? { label: data.status, color: "#666", bg: "#eee" };
  const useMiles = data.country === "us";
  const isTerminal = ["completed", "cancelled", "rejected"].includes(data.status);

  return (
    <div style={{ ...pageStyle, background: bg, color: textPrimary }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${borderColor}`, background: cardBg, flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#3b82f6" }}>LoadMind Tracker</div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 99, color: statusInfo.color, background: statusInfo.bg }}>
          {statusInfo.label}
        </span>
      </div>

      {/* Map */}
      <div ref={mapContainerRef} style={{ flex: 1, minHeight: 0 }} />

      {/* Bottom info bar */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${borderColor}`, background: cardBg, flexShrink: 0 }}>
        {/* Driver info + last updated */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{data.driverName}</div>
          {data.driverLocation && (
            <div style={{ fontSize: 11, color: textSecondary }}>
              {data.driverLocation.isOnline ? "Online" : "Offline"} · Updated {timeAgo(data.driverLocation.timestamp)}
            </div>
          )}
        </div>

        {/* ETA + distance */}
        {route && !isTerminal && (
          <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
            <div style={{ padding: "6px 12px", borderRadius: 8, background: isDark ? "#1e3a5f" : "#eff6ff", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: textSecondary }}>ETA</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#3b82f6" }}>{formatETA(route.duration)}</div>
            </div>
            <div style={{ padding: "6px 12px", borderRadius: 8, background: isDark ? "#1e3a5f" : "#eff6ff", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: textSecondary }}>Distance</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#3b82f6" }}>{formatDistance(route.distance, useMiles)}</div>
            </div>
          </div>
        )}

        {/* Stops */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {data.stops.map((stop, i) => {
            const isCompleted = i < (data.currentStopIndex ?? 0);
            const isCurrent = i === (data.currentStopIndex ?? 0);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, opacity: isCompleted ? 0.5 : 1 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: isCompleted ? "#94a3b8" : stop.type === "pickup" ? "#22c55e" : "#ef4444",
                  border: isCurrent ? "2px solid #3b82f6" : "none",
                  boxSizing: "border-box",
                }} />
                <div style={{ fontSize: 12, color: isCompleted ? textSecondary : textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {stop.label}
                  {isCompleted && <span style={{ marginLeft: 6, color: "#22c55e", fontSize: 10 }}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* No location warning */}
        {!data.driverLocation && !isTerminal && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#ca8a04", textAlign: "center" }}>
            Waiting for driver location update...
          </div>
        )}

        {/* Terminal state */}
        {isTerminal && (
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, textAlign: "center", color: statusInfo.color }}>
            {data.status === "completed" ? "This delivery has been completed." : "This trip has ended."}
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};
