import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type LocationHistory, type Trip, getStopsFromTrip } from "@nexus/shared";
import { useThemeStore } from "@/stores/theme";
import { fetchRoute } from "@/services/routing";

const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const TRACK_LINE_SOURCE = "history-track";
const TRACK_LINE_LAYER = "history-track-line";
const TRACK_POINTS_SOURCE = "history-points";
const TRACK_POINTS_LAYER = "history-circles";
const TRIP_ROUTE_SOURCE = "trip-route";
const TRIP_ROUTE_LAYER = "trip-route-line";

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
  history: LocationHistory[];
  selectedTrip: Trip | null;
}

export default function HistoryMapView({ history, selectedTrip }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const historyPopupRef = useRef<maplibregl.Popup | null>(null);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const historyDataRef = useRef<LocationHistory[]>([]);
  const tripDataRef = useRef<Trip | null>(null);
  const theme = useThemeStore((s) => s.theme);

  // --- Cleanup helpers ---

  const removeTrackLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer(TRACK_POINTS_LAYER)) map.removeLayer(TRACK_POINTS_LAYER);
      if (map.getSource(TRACK_POINTS_SOURCE)) map.removeSource(TRACK_POINTS_SOURCE);
      if (map.getLayer(TRACK_LINE_LAYER)) map.removeLayer(TRACK_LINE_LAYER);
      if (map.getSource(TRACK_LINE_SOURCE)) map.removeSource(TRACK_LINE_SOURCE);
    } catch { /* style may have removed them */ }
    historyPopupRef.current?.remove();
    historyPopupRef.current = null;
  }, []);

  const removeRouteLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer(TRIP_ROUTE_LAYER)) map.removeLayer(TRIP_ROUTE_LAYER);
      if (map.getSource(TRIP_ROUTE_SOURCE)) map.removeSource(TRIP_ROUTE_SOURCE);
    } catch { /* style may have removed them */ }
    routeMarkersRef.current.forEach((m) => m.remove());
    routeMarkersRef.current = [];
  }, []);

  // --- Draw functions ---

  const drawTrack = useCallback(() => {
    const map = mapRef.current;
    const data = historyDataRef.current;
    if (!map || data.length === 0) return;
    if (!map.isStyleLoaded()) return;

    removeTrackLayers();

    // Track line (polyline connecting points chronologically)
    if (data.length >= 2) {
      const lineCoords = data.map((e) => [e.lng, e.lat]);
      map.addSource(TRACK_LINE_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: lineCoords },
          properties: {},
        },
      });
      map.addLayer({
        id: TRACK_LINE_LAYER,
        type: "line",
        source: TRACK_LINE_SOURCE,
        paint: {
          "line-color": "#6366f1",
          "line-width": 3,
          "line-opacity": 0.5,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }

    // Track points (circles)
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: data.map((entry) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [entry.lng, entry.lat] },
        properties: {
          timestamp: entry.timestamp,
          speed: entry.speed,
          battery: Math.round(entry.batteryLevel * 100),
        },
      })),
    };

    map.addSource(TRACK_POINTS_SOURCE, { type: "geojson", data: geojson });
    map.addLayer({
      id: TRACK_POINTS_LAYER,
      type: "circle",
      source: TRACK_POINTS_SOURCE,
      paint: {
        "circle-radius": 5,
        "circle-color": "#6366f1",
        "circle-opacity": 0.7,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
      },
    });

    // Hover popup
    map.on("mouseenter", TRACK_POINTS_LAYER, (e) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const props = feature.properties;
      const ts = new Date(props.timestamp).toLocaleString([], {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const speed = props.speed > 0 ? `${Math.round(props.speed * 3.6)} km/h` : "Stationary";

      historyPopupRef.current?.remove();
      historyPopupRef.current = new maplibregl.Popup({ offset: 10, closeButton: false })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(
          `<div style="font-size:12px;line-height:1.4">
            <div style="font-weight:600">${ts}</div>
            <div style="color:#6b7280">${speed} · ${props.battery}%</div>
          </div>`
        )
        .addTo(map);
    });

    map.on("mouseleave", TRACK_POINTS_LAYER, () => {
      map.getCanvas().style.cursor = "";
      historyPopupRef.current?.remove();
      historyPopupRef.current = null;
    });
  }, [removeTrackLayers]);

  const drawTripRoute = useCallback(() => {
    const map = mapRef.current;
    const trip = tripDataRef.current;
    if (!map || !trip) return;
    if (!map.isStyleLoaded()) return;

    removeRouteLayers();

    const stops = getStopsFromTrip(trip);
    if (stops.length < 2) return;

    const waypoints: [number, number][] = stops.map((s) => [s.lng, s.lat]);

    fetchRoute(waypoints).then((route) => {
      if (!route || tripDataRef.current?.id !== trip.id) return;
      if (!map.isStyleLoaded()) return;

      // Remove again in case of race
      removeRouteLayers();

      map.addSource(TRIP_ROUTE_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: route.coordinates },
          properties: {},
        },
      });
      map.addLayer({
        id: TRIP_ROUTE_LAYER,
        type: "line",
        source: TRIP_ROUTE_SOURCE,
        paint: { "line-color": "#3b82f6", "line-width": 4, "line-opacity": 0.8 },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      // Stop markers
      const markers = stops.map((stop) => {
        const color = stop.type === "pickup" ? "#22c55e" : "#ef4444";
        return new maplibregl.Marker({ element: createWaypointMarker(color, stop.label) })
          .setLngLat([stop.lng, stop.lat])
          .addTo(map);
      });
      routeMarkersRef.current = markers;

      // Fit bounds to trip route
      const bounds = new maplibregl.LngLatBounds();
      waypoints.forEach((wp) => bounds.extend(wp));
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
    });
  }, [removeRouteLayers]);

  // --- Initialize map ---

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
      center: [-98.5, 39.8], // US center
      zoom: 4,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      routeMarkersRef.current.forEach((m) => m.remove());
      routeMarkersRef.current = [];
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Theme switching ---

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);

    const onIdle = () => {
      drawTrack();
      if (tripDataRef.current) drawTripRoute();
    };
    map.once("idle", onIdle);

    return () => { map.off("idle", onIdle); };
  }, [theme, drawTrack, drawTripRoute]);

  // --- Update history data + draw ---

  useEffect(() => {
    historyDataRef.current = history;
    const map = mapRef.current;
    if (!map) return;

    if (history.length === 0) {
      removeTrackLayers();
      return;
    }

    if (map.isStyleLoaded()) {
      drawTrack();
    } else {
      map.once("idle", drawTrack);
    }

    // Fit bounds to history track
    if (history.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      history.forEach((h) => bounds.extend([h.lng, h.lat]));
      map.fitBounds(bounds, { padding: 60, duration: 1000 });
    }
  }, [history, drawTrack, removeTrackLayers]);

  // --- Update trip route ---

  useEffect(() => {
    tripDataRef.current = selectedTrip;
    const map = mapRef.current;
    if (!map) return;

    if (!selectedTrip) {
      removeRouteLayers();
      return;
    }

    if (map.isStyleLoaded()) {
      drawTripRoute();
    } else {
      map.once("idle", drawTripRoute);
    }
  }, [selectedTrip, drawTripRoute, removeRouteLayers]);

  return <div ref={containerRef} className="flex-1 rounded-xl overflow-hidden" />;
}
