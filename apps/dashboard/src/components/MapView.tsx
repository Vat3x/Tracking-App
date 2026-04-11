import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type DriverLocationEntry, getDriverHistory } from "@/services/locations";
import { type User, type Trip, type LocationHistory, timeAgo, getStopsFromTrip } from "@nexus/shared";
import { useThemeStore } from "@/stores/theme";
import { fetchRoute } from "@/services/routing";

// Free CARTO tile styles — no API key needed
const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const ROUTE_PICKUP_SOURCE = "route-pickup";
const ROUTE_PICKUP_LAYER = "route-pickup-line";
const ROUTE_TRIP_SOURCE = "route-trip";
const ROUTE_TRIP_LAYER = "route-trip-line";
const HISTORY_SOURCE = "history-points";
const HISTORY_LAYER = "history-circles";
const HISTORY_TRACK_SOURCE = "history-track";
const HISTORY_TRACK_LAYER = "history-track-line";

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

interface RouteData {
  status: "accepted" | "in_progress";
  coords: [number, number][];
  stops: { lng: number; lat: number; label: string; type: "pickup" | "dropoff" }[];
}

interface Props {
  drivers: DriverLocationEntry[];
  driverProfiles: Map<string, User>;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string | null) => void;
  activeDriverIds: Set<string>;
  trips: Trip[];
  companyId: string | undefined;
  historyTrip?: Trip | null;
  sidebarWidth?: number;
}

export default function MapView({
  drivers,
  driverProfiles,
  selectedDriverId,
  onSelectDriver,
  activeDriverIds,
  trips,
  companyId,
  historyTrip,
  sidebarWidth = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const routeDataRef = useRef<RouteData | null>(null);
  const historyDataRef = useRef<LocationHistory[] | null>(null);
  const historyPopupRef = useRef<maplibregl.Popup | null>(null);
  const mostRecentMarkerRef = useRef<maplibregl.Marker | null>(null);
  const driversRef = useRef(drivers);
  driversRef.current = drivers;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const theme = useThemeStore((s) => s.theme);

  // Remove route layers, sources, and markers from map
  const removeRouteLayers = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      try {
        if (map.getLayer(ROUTE_PICKUP_LAYER)) map.removeLayer(ROUTE_PICKUP_LAYER);
        if (map.getSource(ROUTE_PICKUP_SOURCE)) map.removeSource(ROUTE_PICKUP_SOURCE);
        if (map.getLayer(ROUTE_TRIP_LAYER)) map.removeLayer(ROUTE_TRIP_LAYER);
        if (map.getSource(ROUTE_TRIP_SOURCE)) map.removeSource(ROUTE_TRIP_SOURCE);
      } catch {
        // Style may have already removed sources/layers
      }
    }
    routeMarkersRef.current.forEach((m) => m.remove());
    routeMarkersRef.current = [];
  }, []);

  // Remove history layer and source from map
  const removeHistoryLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer(HISTORY_LAYER)) map.removeLayer(HISTORY_LAYER);
      if (map.getSource(HISTORY_SOURCE)) map.removeSource(HISTORY_SOURCE);
      if (map.getLayer(HISTORY_TRACK_LAYER)) map.removeLayer(HISTORY_TRACK_LAYER);
      if (map.getSource(HISTORY_TRACK_SOURCE)) map.removeSource(HISTORY_TRACK_SOURCE);
    } catch {
      // Style may have already removed sources/layers
    }
    historyPopupRef.current?.remove();
    historyPopupRef.current = null;
    mostRecentMarkerRef.current?.remove();
    mostRecentMarkerRef.current = null;
  }, []);

  // Draw history pins from stored historyDataRef onto the map
  const drawHistoryFromData = useCallback(() => {
    const map = mapRef.current;
    const data = historyDataRef.current;
    if (!map || !data || data.length === 0) return;
    if (!map.isStyleLoaded()) return;

    removeHistoryLayer();

    // Sort oldest → newest so recency index is meaningful
    const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const total = sorted.length;

    // Track line — faded older segment, solid recent
    if (total >= 2) {
      const lineCoords = sorted.map((e) => [e.lng, e.lat]);
      map.addSource(HISTORY_TRACK_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: lineCoords },
          properties: {},
        },
      });
      map.addLayer({
        id: HISTORY_TRACK_LAYER,
        type: "line",
        source: HISTORY_TRACK_SOURCE,
        paint: {
          "line-color": "#818cf8",
          "line-width": 2,
          "line-opacity": 0.45,
          "line-dasharray": [3, 2],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }

    // Inject pulse keyframes once
    if (!document.getElementById("history-pulse-style")) {
      const style = document.createElement("style");
      style.id = "history-pulse-style";
      style.textContent = `
        @keyframes history-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(34,197,94,0.55); }
          70%  { box-shadow: 0 0 0 10px rgba(34,197,94,0);   }
          100% { box-shadow: 0 0 0 0   rgba(34,197,94,0);    }
        }
      `;
      document.head.appendChild(style);
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: sorted.map((entry, i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [entry.lng, entry.lat] },
        properties: {
          timestamp: entry.timestamp,
          speedKmh: Math.round(entry.speed * 3.6),
          battery: Math.round(entry.batteryLevel * 100),
          // 0 = oldest, 1 = newest
          recency: total > 1 ? i / (total - 1) : 1,
        },
      })),
    };

    map.addSource(HISTORY_SOURCE, { type: "geojson", data: geojson });
    map.addLayer({
      id: HISTORY_LAYER,
      type: "circle",
      source: HISTORY_SOURCE,
      paint: {
        // Size: older = 4px, newest = 7px
        "circle-radius": [
          "interpolate", ["linear"], ["get", "recency"],
          0, 4,
          1, 7,
        ],
        // Color by speed: stationary=indigo, slow=blue, medium=green, fast=yellow
        "circle-color": [
          "step", ["get", "speedKmh"],
          "#6366f1",      // 0 km/h — stationary
          5,  "#3b82f6",  // 5+ km/h — slow
          30, "#22c55e",  // 30+ km/h — moving
          80, "#eab308",  // 80+ km/h — fast
        ],
        // Opacity: older = faded, newest = solid
        "circle-opacity": [
          "interpolate", ["linear"], ["get", "recency"],
          0, 0.35,
          1, 0.9,
        ],
        "circle-stroke-width": [
          "interpolate", ["linear"], ["get", "recency"],
          0, 1,
          1, 2,
        ],
        "circle-stroke-color": "#fff",
      },
    });

    // Pulsing HTML marker at the most recent point
    const latest = sorted[sorted.length - 1];
    const pulseEl = document.createElement("div");
    pulseEl.style.cssText = [
      "width:12px", "height:12px", "border-radius:50%",
      "background:#22c55e", "border:2px solid #fff",
      "animation:history-pulse 1.6s ease-out infinite",
      "pointer-events:none",
    ].join(";");
    mostRecentMarkerRef.current = new maplibregl.Marker({ element: pulseEl, anchor: "center" })
      .setLngLat([latest.lng, latest.lat])
      .addTo(map);

    // Hover popup — colored speed badge
    map.on("mouseenter", HISTORY_LAYER, (e) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const props = feature.properties;
      const ts = new Date(props.timestamp).toLocaleString([], {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const kmh: number = props.speedKmh;
      const speedLabel = kmh > 0 ? `${kmh} km/h` : "Stationary";
      const speedColor =
        kmh === 0 ? "#6366f1" : kmh < 30 ? "#3b82f6" : kmh < 80 ? "#22c55e" : "#eab308";

      historyPopupRef.current?.remove();
      historyPopupRef.current = new maplibregl.Popup({ offset: 12, closeButton: false })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(
          `<div style="font-size:12px;line-height:1.5;min-width:110px">
            <div style="font-weight:600;margin-bottom:4px">${ts}</div>
            <div style="display:flex;align-items:center;gap:5px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${speedColor};flex-shrink:0"></span>
              <span style="color:#374151">${speedLabel}</span>
              <span style="color:#9ca3af;margin-left:auto">${props.battery}%</span>
            </div>
          </div>`
        )
        .addTo(map);
    });

    map.on("mouseleave", HISTORY_LAYER, () => {
      map.getCanvas().style.cursor = "";
      historyPopupRef.current?.remove();
      historyPopupRef.current = null;
    });
  }, [removeHistoryLayer]);

  // Draw route from stored routeDataRef onto the map
  const drawRouteFromData = useCallback(() => {
    const map = mapRef.current;
    const data = routeDataRef.current;
    if (!map || !data) return;

    // Must wait for style to be fully loaded
    if (!map.isStyleLoaded()) return;

    // Remove any existing route visuals first
    removeRouteLayers();

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

    // Create stop markers — green for pickups, red for dropoffs
    const markers = data.stops.map((stop) => {
      const color = stop.type === "pickup" ? "#22c55e" : "#ef4444";
      return new maplibregl.Marker({
        element: createWaypointMarker(color, stop.label),
      })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
    });

    if (data.status === "accepted") {
      addRouteLayer(ROUTE_PICKUP_SOURCE, ROUTE_PICKUP_LAYER, data.coords, "#3b82f6", [2, 2]);
    } else {
      addRouteLayer(ROUTE_TRIP_SOURCE, ROUTE_TRIP_LAYER, data.coords, "#3b82f6");
    }

    routeMarkersRef.current = markers;
  }, [removeRouteLayers]);

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
      if (sidebarWidthRef.current > 0) return;
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
      mostRecentMarkerRef.current?.remove();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch map tiles when theme changes — re-draw route after new style loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);

    // setStyle removes all sources/layers; re-draw route + history once new style is ready
    const onIdle = () => {
      if (routeDataRef.current) drawRouteFromData();
      if (historyDataRef.current) drawHistoryFromData();
    };
    map.once("idle", onIdle);

    return () => {
      map.off("idle", onIdle);
    };
  }, [theme, drawRouteFromData, drawHistoryFromData]);

  const showPopup = useCallback(
    (driver: DriverLocationEntry) => {
      const map = mapRef.current;
      if (!map) return;

      const profile = driverProfiles.get(driver.driverId);
      const name = profile?.displayName || profile?.phone || driver.driverId.slice(0, 8);
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

    // Only show online drivers on the map
    const onlineDrivers = drivers.filter((d) => d.current.isOnline);
    const onlineIds = new Set(onlineDrivers.map((d) => d.driverId));

    // Remove markers for drivers no longer online
    markersRef.current.forEach((marker, id) => {
      if (!onlineIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    onlineDrivers.forEach((driver) => {
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

  // Fly to driver only when selection changes (not on every location update)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDriverId) return;

    const driver = driversRef.current.find((d) => d.driverId === selectedDriverId);
    if (!driver) return;

    map.flyTo({
      center: [driver.current.lng, driver.current.lat],
      zoom: 14,
      duration: 1000,
    });

    showPopup(driver);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriverId]);

  // Keep popup content fresh when driver data updates
  useEffect(() => {
    if (!selectedDriverId) return;
    const driver = drivers.find((d) => d.driverId === selectedDriverId);
    if (driver) showPopup(driver);
  }, [drivers, selectedDriverId, showPopup]);

  // Draw road route when a driver with an active trip is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // History trip overrides active trip route
    if (historyTrip) {
      routeDataRef.current = null;
      removeRouteLayers();
      return;
    }

    // No driver selected → clear route
    if (!selectedDriverId) {
      routeDataRef.current = null;
      removeRouteLayers();
      return;
    }

    // Find active trip for selected driver
    const trip = trips.find(
      (t) =>
        t.driverId === selectedDriverId &&
        (t.status === "accepted" || t.status === "in_progress")
    );

    if (!trip) {
      routeDataRef.current = null;
      removeRouteLayers();
      return;
    }

    // Get driver's current location from ref (avoid drivers in deps)
    const driverLoc = driversRef.current.find((d) => d.driverId === selectedDriverId);
    if (!driverLoc) {
      routeDataRef.current = null;
      removeRouteLayers();
      return;
    }

    const { lat: dLat, lng: dLng } = driverLoc.current;
    const tripStops = getStopsFromTrip(trip);

    let cancelled = false;

    // Build waypoints from unified stops
    const stopWaypoints: [number, number][] = tripStops.map(
      (s) => [s.lng, s.lat] as [number, number]
    );

    // Accepted: driver → all stops | In progress: all stops
    const waypoints: [number, number][] =
      trip.status === "accepted"
        ? [[dLng, dLat], ...stopWaypoints]
        : stopWaypoints;

    // Need at least 2 waypoints for routing
    if (waypoints.length < 2) {
      routeDataRef.current = null;
      removeRouteLayers();
      return;
    }

    fetchRoute(waypoints).then((route) => {
      if (cancelled || !route) return;

      routeDataRef.current = {
        status: trip.status as "accepted" | "in_progress",
        coords: route.coordinates,
        stops: tripStops.map((s) => ({ lng: s.lng, lat: s.lat, label: s.label, type: s.type })),
      };

      // Wait for style to be loaded, then draw
      if (map.isStyleLoaded()) {
        drawRouteFromData();
      } else {
        map.once("idle", () => {
          if (!cancelled) drawRouteFromData();
        });
      }

      // Fit map to show the route segment
      const bounds = new maplibregl.LngLatBounds();
      waypoints.forEach((wp) => bounds.extend(wp));
      map.fitBounds(bounds, { padding: { top: 80, right: 80, bottom: 80, left: sidebarWidth + 80 }, duration: 1000 });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedDriverId, trips, historyTrip, sidebarWidth, removeRouteLayers, drawRouteFromData]);

  // Draw OSRM route for a selected history trip
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !historyTrip) return;

    const stops = getStopsFromTrip(historyTrip);
    if (stops.length < 2) return;

    const waypoints: [number, number][] = stops.map((s) => [s.lng, s.lat]);
    let cancelled = false;

    fetchRoute(waypoints).then((route) => {
      if (cancelled || !route) return;

      routeDataRef.current = {
        status: "in_progress",
        coords: route.coordinates,
        stops: stops.map((s) => ({ lng: s.lng, lat: s.lat, label: s.label, type: s.type })),
      };

      if (map.isStyleLoaded()) {
        drawRouteFromData();
      } else {
        map.once("idle", () => {
          if (!cancelled) drawRouteFromData();
        });
      }

      const bounds = new maplibregl.LngLatBounds();
      waypoints.forEach((wp) => bounds.extend(wp));
      map.fitBounds(bounds, { padding: { top: 80, right: 80, bottom: 80, left: sidebarWidth + 80 }, duration: 1000 });
    });

    return () => {
      cancelled = true;
      routeDataRef.current = null;
      removeRouteLayers();
    };
  }, [historyTrip, sidebarWidth, removeRouteLayers, drawRouteFromData]);

  // Fetch and draw location history:
  //   - active trip selected → show live ping trail
  //   - history trip open    → show pins filtered to that trip's timeframe
  //   - neither              → clear
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !companyId) return;

    const hasActiveTrip =
      !!selectedDriverId &&
      trips.some(
        (t) =>
          t.driverId === selectedDriverId &&
          (t.status === "accepted" || t.status === "in_progress")
      );

    const driverIdToFetch = hasActiveTrip
      ? selectedDriverId!
      : historyTrip?.driverId ?? null;

    if (!driverIdToFetch) {
      historyDataRef.current = null;
      removeHistoryLayer();
      return;
    }

    let cancelled = false;

    getDriverHistory(companyId, driverIdToFetch).then((history) => {
      if (cancelled) return;

      // When viewing a completed trip, filter pins to its timeframe
      const filtered = historyTrip && !hasActiveTrip
        ? history.filter(
            (e) => e.timestamp >= historyTrip.createdAt && e.timestamp <= historyTrip.updatedAt
          )
        : history;

      historyDataRef.current = filtered;

      if (map.isStyleLoaded()) {
        drawHistoryFromData();
      } else {
        map.once("idle", () => {
          if (!cancelled) drawHistoryFromData();
        });
      }
    });

    return () => {
      cancelled = true;
      removeHistoryLayer();
    };
  }, [selectedDriverId, trips, historyTrip, companyId, removeHistoryLayer, drawHistoryFromData]);

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
