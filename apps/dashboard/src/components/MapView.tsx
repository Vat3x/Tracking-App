import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DriverLocationEntry } from "@/services/locations";
import type { User } from "@nexus/shared";

// Free OpenStreetMap tile style — no API key needed
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string | null) => void;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
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

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
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

  const showPopup = useCallback(
    (driver: DriverLocationEntry) => {
      const map = mapRef.current;
      if (!map) return;

      const profile = driverProfiles.get(driver.driverId);
      const name = profile?.displayName ?? driver.driverId.slice(0, 8);
      const c = driver.current;

      popupRef.current?.remove();

      const popup = new maplibregl.Popup({ offset: 25, closeButton: false })
        .setLngLat([c.lng, c.lat])
        .setHTML(
          `<div style="font-family:system-ui;font-size:13px;line-height:1.5">
            <strong>${name}</strong><br/>
            <span style="color:#6b7280">${formatTimeAgo(c.timestamp)}</span><br/>
            ${Math.round(c.batteryLevel * 100)}% battery${c.isCharging ? " ⚡" : ""}<br/>
            ${c.speed > 0 ? `${Math.round(c.speed * 3.6)} km/h` : "Stationary"}
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
        el.style.cssText =
          "width:32px;height:32px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;transition:transform 0.15s;";

        el.addEventListener("mouseenter", () => {
          el.style.transform = "scale(1.2)";
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "scale(1)";
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectDriver(driverId);
          showPopup(driver);
        });

        if (!current.isOnline) {
          el.style.background = "#9ca3af";
        }

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([current.lng, current.lat])
          .addTo(map);

        markersRef.current.set(driverId, marker);
      }

      // Update marker color based on online status
      const marker = markersRef.current.get(driverId);
      if (marker) {
        const el = marker.getElement();
        el.style.background = current.isOnline ? "#3b82f6" : "#9ca3af";
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
