import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { firebaseConfig } from "@nexus/shared";

const FUNCTIONS_BASE = "https://us-central1-tracking-app-f6ad7.cloudfunctions.net";

// Secondary Firebase app — avoids interfering with dispatcher auth
const TRACKING_APP_NAME = "tracking-public";
const trackingApp = getApps().find((a) => a.name === TRACKING_APP_NAME)
  ?? initializeApp(firebaseConfig, TRACKING_APP_NAME);
const trackingAuth = getAuth(trackingApp);
const trackingRtdb = getDatabase(trackingApp);

const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

function injectTrackingStyles() {
  if (document.getElementById("tracking-page-styles")) return;
  const style = document.createElement("style");
  style.id = "tracking-page-styles";
  style.textContent = `
    @keyframes driver-pulse {
      0%   { transform: scale(1);   opacity: 0.55; }
      70%  { transform: scale(2.6); opacity: 0; }
      100% { transform: scale(2.6); opacity: 0; }
    }
    .driver-pulse-ring {
      animation: driver-pulse 2s ease-out infinite;
    }
  `;
  document.head.appendChild(style);
}

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
  rtdbToken?: string;
  rtdbPath?: string;
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
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

function formatDistance(meters: number, useMiles: boolean): string {
  if (useMiles) {
    const miles = meters / 1609.34;
    return miles < 0.1 ? `${Math.round(meters * 3.281)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function formatSpeed(mps: number, useMiles: boolean): string {
  if (useMiles) return `${Math.round(mps * 2.237)} mph`;
  return `${Math.round(mps * 3.6)} km/h`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:     { label: "Awaiting Driver",     color: "#b45309", bg: "#fef3c7", dot: "#f59e0b" },
  accepted:    { label: "En Route to Pickup",  color: "#1d4ed8", bg: "#dbeafe", dot: "#3b82f6" },
  in_progress: { label: "In Transit",          color: "#4338ca", bg: "#e0e7ff", dot: "#6366f1" },
  completed:   { label: "Delivered",           color: "#15803d", bg: "#dcfce7", dot: "#22c55e" },
  cancelled:   { label: "Cancelled",           color: "#b91c1c", bg: "#fee2e2", dot: "#ef4444" },
  rejected:    { label: "Declined",            color: "#b91c1c", bg: "#fee2e2", dot: "#ef4444" },
};

function createDriverMarker(_heading = 0): HTMLElement {
  injectTrackingStyles();

  // Outer wrapper — sized to fit pin + pulse
  const wrap = document.createElement("div");
  wrap.style.cssText = "width:48px;height:58px;overflow:visible;position:relative;display:flex;flex-direction:column;align-items:center;";

  // Pulse ring (sits behind the pin head)
  const pulse = document.createElement("div");
  pulse.className = "driver-pulse-ring";
  pulse.style.cssText = "position:absolute;top:0;width:42px;height:42px;border-radius:50%;background:rgba(37,99,235,0.3);pointer-events:none;";

  // Pin head (circle)
  const head = document.createElement("div");
  head.style.cssText = "position:relative;width:42px;height:42px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 4px 12px rgba(37,99,235,0.5);display:flex;align-items:center;justify-content:center;flex-shrink:0;";

  // Truck icon inside pin head
  const icon = document.createElement("div");
  icon.className = "driver-icon-inner";
  icon.style.cssText = "display:flex;align-items:center;justify-content:center;";
  // Classic side-view truck SVG (faces right by default; heading=0 = north → rotate -90)
  icon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 3h13v9H1zM14 7h4l3 4v3h-7V7z"/>
    <circle cx="5.5" cy="17.5" r="2" fill="white" stroke="#2563eb" stroke-width="1"/>
    <circle cx="18.5" cy="17.5" r="2" fill="white" stroke="#2563eb" stroke-width="1"/>
    <rect x="1" y="12" width="13" height="2" fill="white"/>
  </svg>`;

  // Pin tail (triangle)
  const tail = document.createElement("div");
  tail.style.cssText = "width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #2563eb;margin-top:-2px;filter:drop-shadow(0 2px 2px rgba(37,99,235,0.3));";

  head.appendChild(icon);
  wrap.appendChild(pulse);
  wrap.appendChild(head);
  wrap.appendChild(tail);
  return wrap;
}

function createStopMarker(color: string, label: string, type: "pickup" | "dropoff"): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;overflow:visible;cursor:pointer;";
  wrap.title = label;

  const head = document.createElement("div");
  head.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;`;

  // Pickup = arrow up, Dropoff = flag/destination dot
  const icon = type === "pickup"
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M12 4l-7 8h4v8h6v-8h4z"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>`;

  head.innerHTML = icon;

  const tail = document.createElement("div");
  tail.style.cssText = `width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${color};margin-top:-1px;`;

  wrap.appendChild(head);
  wrap.appendChild(tail);
  return wrap;
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

  const [isDark, setIsDark] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Initial fetch + RTDB real-time subscription
  useEffect(() => {
    if (!linkId) return;
    let rtdbRef: ReturnType<typeof ref> | null = null;

    async function init() {
      try {
        const res = await fetch(`${FUNCTIONS_BASE}/getTrackingData?linkId=${encodeURIComponent(linkId!)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Link not found or expired");
          setLoading(false);
          return;
        }
        const json: TrackingData = await res.json();
        setData(json);
        setError(null);
        setLoading(false);

        if (json.rtdbToken && json.rtdbPath) {
          await signInWithCustomToken(trackingAuth, json.rtdbToken);
          rtdbRef = ref(trackingRtdb, json.rtdbPath);
          onValue(rtdbRef, (snapshot) => {
            const loc = snapshot.val();
            if (!loc) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    driverLocation: {
                      lat: loc.lat,
                      lng: loc.lng,
                      speed: loc.speed ?? 0,
                      heading: loc.heading ?? 0,
                      timestamp: loc.timestamp,
                      isOnline: loc.isOnline ?? false,
                    },
                  }
                : prev
            );
          });
        }
      } catch {
        setError("Unable to load tracking data. Check your connection.");
        setLoading(false);
      }
    }

    init();
    return () => { if (rtdbRef) off(rtdbRef); };
  }, [linkId]);

  // Init map
  useEffect(() => {
    if (loading || !mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
      center: [-98.5, 39.8],
      zoom: 4,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [loading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);
  }, [isDark]);

  // Update map markers + route when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    if (data.driverLocation) {
      const { lat, lng, heading } = data.driverLocation;
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new maplibregl.Marker({ element: createDriverMarker(heading) })
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        driverMarkerRef.current.setLngLat([lng, lat]);
      }
    }

    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];
    data.stops.forEach((stop) => {
      const color = stop.type === "pickup" ? "#22c55e" : "#ef4444";
      const marker = new maplibregl.Marker({ element: createStopMarker(color, stop.label, stop.type) })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });

    if (!initialFit.current && (data.driverLocation || data.stops.length > 0)) {
      initialFit.current = true;
      const bounds = new maplibregl.LngLatBounds();
      if (data.driverLocation) bounds.extend([data.driverLocation.lng, data.driverLocation.lat]);
      data.stops.forEach((s) => bounds.extend([s.lng, s.lat]));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 70, maxZoom: 14 });
    }

    const driverLoc = data.driverLocation;
    if (driverLoc && data.stops.length > 0) {
      const prev = prevDriverPos.current;
      const moved = !prev || Math.abs(prev.lat - driverLoc.lat) > 0.003 || Math.abs(prev.lng - driverLoc.lng) > 0.003;
      if (moved) {
        prevDriverPos.current = { lat: driverLoc.lat, lng: driverLoc.lng };
        const waypoints: [number, number][] = [[driverLoc.lng, driverLoc.lat]];
        const idx = data.currentStopIndex ?? 0;
        const relevantStops = data.status === "accepted"
          ? [data.stops[0]]
          : data.stops.slice(idx);
        relevantStops.forEach((s) => { if (s) waypoints.push([s.lng, s.lat]); });
        fetchRoute(waypoints).then((r) => setRoute(r));
      }
    }
  }, [data]);

  // Draw route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const drawRoute = () => {
      try {
        if (map.getLayer("track-route-line")) map.removeLayer("track-route-line");
        if (map.getLayer("track-route-casing")) map.removeLayer("track-route-casing");
        if (map.getSource("track-route")) map.removeSource("track-route");
      } catch { /* ignore */ }

      if (!route) return;

      const isDashed = data.status === "accepted";

      map.addSource("track-route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: route.coordinates }, properties: {} },
      });

      // White casing
      map.addLayer({
        id: "track-route-casing",
        type: "line",
        source: "track-route",
        paint: {
          "line-color": "#ffffff",
          "line-width": 7,
          "line-opacity": 0.6,
        },
      });

      map.addLayer({
        id: "track-route-line",
        type: "line",
        source: "track-route",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 4,
          "line-opacity": 0.95,
          ...(isDashed ? { "line-dasharray": [3, 3] } : {}),
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

  const bg = isDark ? "#0f172a" : "#f1f5f9";
  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const textPrimary = isDark ? "#f1f5f9" : "#1e293b";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const statBg = isDark ? "#0f2033" : "#eff6ff";
  const statBorder = isDark ? "#1e3a5f" : "#bfdbfe";

  if (loading) {
    return (
      <div style={{ ...pageStyle, background: bg, color: textPrimary, justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M3 8h14l3 5v3h-2.5a2.5 2.5 0 0 1-5 0h-5a2.5 2.5 0 0 1-5 0H1V9a1 1 0 0 1 1-1h1z"/>
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 6 }}>LoadMind Tracker</div>
          <div style={{ fontSize: 13, color: textSecondary }}>Loading tracking data…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...pageStyle, background: bg, color: textPrimary, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", padding: "28px 24px", background: cardBg, borderRadius: 16, maxWidth: 380, width: "100%", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 8 }}>Link Unavailable</div>
          <div style={{ fontSize: 14, color: "#ef4444", marginBottom: 8 }}>{error}</div>
          <div style={{ fontSize: 13, color: textSecondary }}>This link may have expired or the trip has ended.</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const statusInfo = STATUS_CONFIG[data.status] ?? { label: data.status, color: "#666", bg: "#eee", dot: "#999" };
  const useMiles = data.country === "us";
  const isTerminal = ["completed", "cancelled", "rejected"].includes(data.status);
  const currentIdx = data.currentStopIndex ?? 0;
  const speed = data.driverLocation?.speed ?? 0;
  const isMoving = speed > 0.5;

  return (
    <div style={{ ...pageStyle, background: bg, color: textPrimary }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px",
        paddingTop: "max(10px, env(safe-area-inset-top))",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${borderColor}`,
        background: cardBg,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M3 8h14l3 5v3h-2.5a2.5 2.5 0 0 1-5 0h-5a2.5 2.5 0 0 1-5 0H1V9a1 1 0 0 1 1-1h1z"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>LoadMind</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 99, color: statusInfo.color, background: statusInfo.bg }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusInfo.dot, flexShrink: 0 }} />
          {statusInfo.label}
        </div>
      </div>

      {/* Map */}
      <div ref={mapContainerRef} style={{ flex: 1, minHeight: 0 }} />

      {/* Bottom panel */}
      <div style={{
        background: cardBg,
        borderTop: `1px solid ${borderColor}`,
        flexShrink: 0,
        maxHeight: "55dvh",
        overflowY: "auto",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        WebkitOverflowScrolling: "touch",
      }}>

        {/* Driver row */}
        <div style={{ padding: "12px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Avatar */}
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
                {data.driverName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{data.driverName}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: data.driverLocation?.isOnline ? "#22c55e" : "#94a3b8", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: textSecondary }}>
                  {data.driverLocation?.isOnline ? "Online" : "Offline"}
                  {data.driverLocation ? ` · ${timeAgo(data.driverLocation.timestamp)}` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Speed badge */}
          {data.driverLocation && isMoving && !isTerminal && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: isDark ? "#1e3a5f" : "#eff6ff", border: `1px solid ${statBorder}` }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>
                {formatSpeed(speed, useMiles)}
              </span>
            </div>
          )}
        </div>

        {/* ETA + Distance */}
        {route && !isTerminal && (
          <div style={{ display: "flex", gap: 8, padding: "10px 16px 0" }}>
            <div style={{ flex: 1, padding: "8px 12px", borderRadius: 10, background: statBg, border: `1px solid ${statBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textSecondary} strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                <span style={{ fontSize: 10, color: textSecondary, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>ETA</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#2563eb", lineHeight: 1 }}>{formatETA(route.duration)}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 12px", borderRadius: 10, background: statBg, border: `1px solid ${statBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textSecondary} strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18"/>
                </svg>
                <span style={{ fontSize: 10, color: textSecondary, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>Distance</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#2563eb", lineHeight: 1 }}>{formatDistance(route.distance, useMiles)}</div>
            </div>
          </div>
        )}

        {/* Active stop highlight */}
        {!isTerminal && data.stops[currentIdx] && (
          <div style={{ margin: "10px 16px 0", padding: "10px 12px", borderRadius: 10, background: isDark ? "#1a2535" : "#f8fafc", border: `1px solid ${data.stops[currentIdx].type === "pickup" ? (isDark ? "#14532d" : "#bbf7d0") : (isDark ? "#7f1d1d" : "#fecaca")}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: data.stops[currentIdx].type === "pickup" ? "#22c55e" : "#ef4444", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {data.stops[currentIdx].type === "pickup"
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 4l-7 8h4v8h6v-8h4z"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: data.stops[currentIdx].type === "pickup" ? "#16a34a" : "#dc2626", letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: 2 }}>
                {data.stops[currentIdx].type === "pickup" ? "Next Pickup" : "Delivering to"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {data.stops[currentIdx].label}
              </div>
              {data.stops[currentIdx].note && (
                <div style={{ fontSize: 11, color: textSecondary, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {data.stops[currentIdx].note}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stops timeline */}
        {data.stops.length > 0 && (
          <div style={{ padding: "10px 16px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 8 }}>
              Stops
            </div>
            <div style={{ position: "relative" }}>
              {/* Vertical connector line */}
              {data.stops.length > 1 && (
                <div style={{
                  position: "absolute",
                  left: 11,
                  top: 14,
                  bottom: 14,
                  width: 2,
                  background: borderColor,
                  zIndex: 0,
                }} />
              )}
              {data.stops.map((stop, i) => {
                const done = i < currentIdx;
                const active = i === currentIdx && !isTerminal;
                const dotColor = done ? "#94a3b8" : stop.type === "pickup" ? "#22c55e" : "#ef4444";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, position: "relative", zIndex: 1, marginBottom: i < data.stops.length - 1 ? 8 : 0 }}>
                    {/* Dot */}
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: done ? (isDark ? "#1e293b" : "#f1f5f9") : dotColor,
                      border: `2.5px solid ${done ? (isDark ? "#475569" : "#cbd5e1") : dotColor}`,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: active ? `0 0 0 3px ${dotColor}33` : "none",
                    }}>
                      {done ? (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke={isDark ? "#64748b" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{i + 1}</span>
                      )}
                    </div>
                    {/* Label */}
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        color: done ? textSecondary : textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                        opacity: done ? 0.6 : 1,
                      }}>
                        {stop.label}
                      </div>
                      <div style={{ fontSize: 10, color: textSecondary, marginTop: 1 }}>
                        {stop.type === "pickup" ? "Pickup" : "Drop-off"}
                        {done && <span style={{ marginLeft: 6, color: "#22c55e", fontWeight: 600 }}>Done</span>}
                        {active && <span style={{ marginLeft: 6, color: dotColor, fontWeight: 600 }}>Active</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Waiting for location */}
        {!data.driverLocation && !isTerminal && (
          <div style={{ padding: "8px 16px 12px", fontSize: 12, color: "#b45309", textAlign: "center" }}>
            Waiting for driver location…
          </div>
        )}

        {/* Terminal state */}
        {isTerminal && (
          <div style={{ padding: "8px 16px 12px", fontSize: 13, fontWeight: 600, textAlign: "center", color: statusInfo.color }}>
            {data.status === "completed" ? "This delivery has been completed." : "This trip has ended."}
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  height: "100dvh",
  maxHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  overflow: "hidden",
};
