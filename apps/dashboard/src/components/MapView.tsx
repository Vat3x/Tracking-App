import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DriverLocationEntry } from "@/services/locations";
import { type User, STALE_THRESHOLD_MS, timeAgo } from "@nexus/shared";
import { useThemeStore } from "@/stores/theme";

// Free CARTO tile styles — no API key needed
const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function getMarkerColor(current: { isOnline: boolean; timestamp: number }): string {
  if (!current.isOnline) return "#9ca3af"; // gray — offline
  const isStale = Date.now() - current.timestamp > STALE_THRESHOLD_MS;
  return isStale ? "#eab308" : "#22c55e"; // yellow — stale, green — fresh
}

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string | null) => void;
}

export default function MapView({
  drivers,
  driverProfiles,
  selectedDriverId,
  onSelectDriver,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const theme = useThemeStore((s) => s.theme);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
      center: [0, 20],
      zoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("click", () => {
      onSelectDriver(null);
      popupRef.current?.remove();
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      popupRef.current?.remove();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch map tiles when theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);
  }, [theme]);

  const showPopup = useCallback(
    (driver: DriverLocationEntry) => {
      const map = mapRef.current;
      if (!map) return;

      const profile = driverProfiles.get(driver.driverId);
      const name = profile?.displayName ?? driver.driverId.slice(0, 8);
      const c = driver.current;
      const isDark = document.documentElement.classList.contains("dark");

      popupRef.current?.remove();

      const isStale = Date.now() - c.timestamp > STALE_THRESHOLD_MS;
      const statusColor = c.isOnline && !isStale ? "#22c55e" : isStale ? "#eab308" : "#9ca3af";
      const statusLabel = c.isOnline ? (isStale ? "Stale" : "Online") : "Offline";
      const battery = Math.round(c.batteryLevel * 100);
      const speed = c.speed > 0 ? `${Math.round(c.speed * 3.6)} km/h` : "Stationary";

      const nameColor = isDark ? "#f3f4f6" : "#111827";
      const valueColor = isDark ? "#e5e7eb" : "#374151";
      const cardBg = isDark ? "#374151" : "#f3f4f6";
      const labelColor = isDark ? "#6b7280" : "#9ca3af";

      const popup = new maplibregl.Popup({ offset: 25, closeButton: false, className: "driver-popup" })
        .setLngLat([c.lng, c.lat])
        .setHTML(
          `<div style="font-family:system-ui;padding:4px 2px;min-width:160px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="width:32px;height:32px;border-radius:50%;background:${statusColor}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <div style="width:8px;height:8px;border-radius:50%;background:${statusColor}"></div>
              </div>
              <div>
                <div style="font-weight:600;font-size:13px;color:${nameColor}">${name}</div>
                <div style="font-size:11px;color:${statusColor};font-weight:500">${statusLabel} · ${timeAgo(c.timestamp)}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <div style="background:${cardBg};border-radius:6px;padding:6px 8px">
                <div style="font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:0.5px">Battery</div>
                <div style="font-size:13px;font-weight:600;color:${valueColor}">${battery}%${c.isCharging ? " ⚡" : ""}</div>
              </div>
              <div style="background:${cardBg};border-radius:6px;padding:6px 8px">
                <div style="font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:0.5px">Speed</div>
                <div style="font-size:13px;font-weight:600;color:${valueColor}">${speed}</div>
              </div>
            </div>
          </div>`
        )
        .addTo(map);

      popupRef.current = popup;
    },
    [driverProfiles]
  );

  // Sync markers with driver data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(drivers.map((d) => d.driverId));

    // Remove markers for drivers no longer in the list
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    drivers.forEach((driver) => {
      const { driverId, current } = driver;
      const existing = markersRef.current.get(driverId);

      if (existing) {
        existing.setLngLat([current.lng, current.lat]);
      } else {
        const el = document.createElement("div");
        el.className = "driver-marker";
        el.style.cssText = "width:36px;height:36px;overflow:visible;";

        const inner = document.createElement("div");
        inner.style.cssText =
          "width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;transition:transform 0.15s;";
        inner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.684-.949V8a1 1 0 0 1 1-1h1.382a1 1 0 0 1 .894.553l1.448 2.894A1 1 0 0 0 20.236 11H21a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>`;
        el.appendChild(inner);

        el.addEventListener("mouseenter", () => {
          inner.style.transform = "scale(1.2)";
        });
        el.addEventListener("mouseleave", () => {
          inner.style.transform = "scale(1)";
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectDriver(driverId);
          showPopup(driver);
        });

        inner.style.background = getMarkerColor(current);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([current.lng, current.lat])
          .addTo(map);

        markersRef.current.set(driverId, marker);
      }

      // Update marker color based on status (green/yellow/gray)
      const marker = markersRef.current.get(driverId);
      if (marker) {
        const inner = marker.getElement().firstElementChild as HTMLElement;
        if (inner) inner.style.background = getMarkerColor(current);
      }
    });
  }, [drivers, onSelectDriver, showPopup]);

  // Fly to selected driver
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDriverId) return;

    const driver = drivers.find((d) => d.driverId === selectedDriverId);
    if (!driver) return;

    map.flyTo({
      center: [driver.current.lng, driver.current.lat],
      zoom: 14,
      duration: 1000,
    });

    showPopup(driver);
  }, [selectedDriverId, drivers, showPopup]);

  // Fit bounds when drivers first load
  const hasFittedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || drivers.length === 0 || hasFittedRef.current) return;

    const onlineDrivers = drivers.filter((d) => d.current.isOnline);
    const target = onlineDrivers.length > 0 ? onlineDrivers : drivers;

    if (target.length === 1) {
      map.flyTo({
        center: [target[0].current.lng, target[0].current.lat],
        zoom: 12,
        duration: 1000,
      });
    } else {
      const bounds = new maplibregl.LngLatBounds();
      target.forEach((d) => bounds.extend([d.current.lng, d.current.lat]));
      map.fitBounds(bounds, { padding: 60, duration: 1000 });
    }

    hasFittedRef.current = true;
  }, [drivers]);

  return <div ref={containerRef} className="flex-1 rounded-xl overflow-hidden" />;
}
