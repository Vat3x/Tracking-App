const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export interface RouteResult {
  /** GeoJSON coordinates [lng, lat][] for the full route */
  coordinates: [number, number][];
  /** Total distance in meters */
  distance: number;
  /** Total duration in seconds */
  duration: number;
}

/**
 * Fetch a road route from OSRM between ordered waypoints.
 * Returns null if the request fails or no route is found.
 */
export async function fetchRoute(
  waypoints: [number, number][] // [lng, lat][]
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;

    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance,
      duration: route.duration,
    };
  } catch {
    return null;
  }
}
