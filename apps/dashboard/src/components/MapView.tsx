import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DriverLocationEntry } from "@/services/locations";
import { type User, type Trip, timeAgo } from "@nexus/shared";
import { useThemeStore } from "@/stores/theme";
import { fetchRoute } from "@/services/routing";

// Free CARTO tile styles — no API key needed
const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const ROUTE_PICKUP_SOURCE = "route-pickup";
const ROUTE_PICKUP_LAYER = "route-pickup-line";
const ROUTE_TRIP_SOURCE = "route-trip";
const ROUTE_TRIP_LAYER = "route-trip-line";

function getMarkerColor(current: { isOnline: boolean }, hasActiveTrip: boolean): string {
  if (!current.isOnline) return "#ef4444"; // red — inactive
  return hasActiveTrip ? "#eab308" : "#22c55e"; // yellow — in transit, green — active
}

function createWaypointMarker(color: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:24px;height:24px;overflow:visible;";
  const inner = document.createElement("div");
  inner.style.cssText = `width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;`;
  inner.title = label;
  el.appendChild(inner);
  return el;
}

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string | null) => void;
  activeDriverIds: Set<string>;
  trips: Trip[];
}

export default function MapView({
  drivers,
  driverProfiles,
  selectedDriverId,
  onSelectDriver,
  activeDriverIds,
  trips,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const routeRequestRef = useRef(0); // for cancelling stale requests
  const theme = useThemeStore((s) => s.theme);

  // Helper: remove route layers, sources, and markers
  const clearRoute = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      if (map.getLayer(ROUTE_PICKUP_LAYER)) map.removeLayer(ROUTE_PICKUP_LAYER);
      if (map.getSource(ROUTE_PICKUP_SOURCE)) map.removeSource(ROUTE_PICKUP_SOURCE);
      if (map.getLayer(ROUTE_TRIP_LAYER)) map.removeLayer(ROUTE_TRIP_LAYER);
      if (map.getSource(ROUTE_TRIP_SOURCE)) map.removeSource(ROUTE_TRIP_SOURCE);
    }
    routeMarkersRef.current.forEach((m) => m.remove());
    routeMarkersRef.current = [];
  }, []);

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
      routeMarkersRef.current.forEach((m) => m.remove());
      routeMarkersRef.current = [];
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
      popupRef.current?.remove();

      const hasActiveTrip = activeDriverIds.has(driver.driverId);
      const statusColor = !c.isOnline ? "#ef4444" : hasActiveTrip ? "#eab308" : "#22c55e";
      const statusLabel = !c.isOnline ? "Inactive" : hasActiveTrip ? "In Transit" : "Active";
      const battery = Math.round(c.batteryLevel * 100);
      const speed = c.speed > 0 ? `${Math.round(c.speed * 3.6)} km/h` : "Stationary";

      const popup = new maplibregl.Popup({ offset: 25, closeButton: false, className: "driver-popup" })
        .setLngLat([c.lng, c.lat])
        .setHTML(
          `<div class="dp-root">
            <div class="dp-header">
              <div class="dp-dot-ring" style="background:${statusColor}20">
                <div class="dp-dot" style="background:${statusColor}"></div>
              </div>
              <div>
                <div class="dp-name">${name}</div>
                <div class="dp-status" style="color:${statusColor}">${statusLabel} · ${timeAgo(c.timestamp)}</div>
              </div>
            </div>
            <div class="dp-cards">
              <div class="dp-card">
                <div class="dp-label">Battery</div>
                <div class="dp-value">${battery}%${c.isCharging ? " ⚡" : ""}</div>
              </div>
              <div class="dp-card">
                <div class="dp-label">Speed</div>
                <div class="dp-value">${speed}</div>
              </div>
            </div>
          </div>`
        )
        .addTo(map);

      popupRef.current = popup;
    },
    [driverProfiles, activeDriverIds]
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

        inner.style.background = getMarkerColor(current, activeDriverIds.has(driverId));

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([current.lng, current.lat])
          .addTo(map);

        markersRef.current.set(driverId, marker);
      }

      // Update marker color based on status (green/yellow/gray)
      const marker = markersRef.current.get(driverId);
      if (marker) {
        const inner = marker.getElement().firstElementChild as HTMLElement;
        if (inner) inner.style.background = getMarkerColor(current, activeDriverIds.has(driverId));
      }
    });
  }, [drivers, onSelectDriver, showPopup, activeDriverIds]);

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

  // Draw road route when a driver with an active trip is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Increment request counter to cancel stale requests
    const requestId = ++routeRequestRef.current;

    // No driver selected → clear route
    if (!selectedDriverId) {
      clearRoute();
      return;
    }

    // Find active trip for selected driver
    const trip = trips.find(
      (t) =>
        t.driverId === selectedDriverId &&
        (t.status === "accepted" || t.status === "in_progress")
    );

    if (!trip) {
      clearRoute();
      return;
    }

    // Get driver's current location
    const driverLoc = drivers.find((d) => d.driverId === selectedDriverId);
    if (!driverLoc) {
      clearRoute();
      return;
    }

    const { lat: dLat, lng: dLng } = driverLoc.current;
    const { lat: oLat, lng: oLng } = trip.origin;
    const { lat: destLat, lng: destLng } = trip.destination;

    // Fetch both route segments in parallel
    Promise.all([
      fetchRoute([[dLng, dLat], [oLng, oLat]]),
      fetchRoute([[oLng, oLat], [destLng, destLat]]),
    ]).then(([pickupRoute, tripRoute]) => {
      // Stale request — a newer one was triggered
      if (requestId !== routeRequestRef.current) return;
      if (!mapRef.current) return;

      clearRoute();

      const addRouteLayer = (
        sourceId: string,
        layerId: string,
        coordinates: [number, number][],
        color: string,
        dasharray?: number[]
      ) => {
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates },
            properties: {},
          },
        });
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": color,
            "line-width": 4,
            "line-opacity": 0.8,
            ...(dasharray ? { "line-dasharray": dasharray } : {}),
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      };

      // Driver → Pickup: dashed blue
      if (pickupRoute) {
        addRouteLayer(
          ROUTE_PICKUP_SOURCE,
          ROUTE_PICKUP_LAYER,
          pickupRoute.coordinates,
          "#3b82f6",
          [2, 2]
        );
      }

      // Pickup → Dropoff: solid blue
      if (tripRoute) {
        addRouteLayer(
          ROUTE_TRIP_SOURCE,
          ROUTE_TRIP_LAYER,
          tripRoute.coordinates,
          "#3b82f6"
        );
      }

      // Add origin marker (green)
      const originMarker = new maplibregl.Marker({
        element: createWaypointMarker("#22c55e", trip.origin.label),
      })
        .setLngLat([oLng, oLat])
        .addTo(map);

      // Add destination marker (red)
      const destMarker = new maplibregl.Marker({
        element: createWaypointMarker("#ef4444", trip.destination.label),
      })
        .setLngLat([destLng, destLat])
        .addTo(map);

      routeMarkersRef.current = [originMarker, destMarker];

      // Fit map to show the full route
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([dLng, dLat]);
      bounds.extend([oLng, oLat]);
      bounds.extend([destLng, destLat]);
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
    });

    return () => {
      routeRequestRef.current++;
    };
  }, [selectedDriverId, trips, drivers, clearRoute]);

  // Re-add route layers after theme switch (setStyle removes all sources/layers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleStyleData = () => {
      // After style loads, trigger route re-render by bumping request counter
      // The route useEffect will re-run on next selectedDriverId/trips/drivers change
      // For immediate re-render, we force it by clearing and re-triggering
      if (selectedDriverId) {
        clearRoute();
        routeRequestRef.current++;
      }
    };

    map.on("styledata", handleStyleData);
    return () => {
      map.off("styledata", handleStyleData);
    };
  }, [selectedDriverId, clearRoute]);

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
