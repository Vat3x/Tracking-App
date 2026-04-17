const GOOGLE_DIRECTIONS_BASE = "https://maps.googleapis.com/maps/api/directions/json";
const GOOGLE_MAPS_KEY = "AIzaSyCNzAjZeOqR_1bzGHb7zZEWhiyTFKX_Ju0";
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export interface RouteResult {
  /** GeoJSON coordinates [lng, lat][] for the full route */
  coordinates: [number, number][];
  /** Total distance in meters */
  distance: number;
  /** Total duration in seconds (traffic-aware when available) */
  duration: number;
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}

async function fetchGoogleRoute(waypoints: [number, number][]): Promise<RouteResult | null> {
  try {
    const origin = `${waypoints[0][1]},${waypoints[0][0]}`;
    const destination = `${waypoints[waypoints.length - 1][1]},${waypoints[waypoints.length - 1][0]}`;
    let url = `${GOOGLE_DIRECTIONS_BASE}?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_KEY}&departure_time=now&traffic_model=best_guess`;
    if (waypoints.length > 2) {
      const intermediate = waypoints.slice(1, -1).map(([lng, lat]) => `${lat},${lng}`).join("|");
      url += `&waypoints=${intermediate}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    let totalDistance = 0, totalDuration = 0;
    for (const leg of route.legs) {
      totalDistance += leg.distance.value;
      totalDuration += (leg.duration_in_traffic?.value ?? leg.duration.value);
    }
    return { coordinates: decodePolyline(route.overview_polyline.points), distance: totalDistance, duration: totalDuration };
  } catch {
    return null;
  }
}

/**
 * Fetch a road route — tries Google Directions (traffic-aware) first, falls back to OSRM.
 */
export async function fetchRoute(
  waypoints: [number, number][] // [lng, lat][]
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  const googleResult = await fetchGoogleRoute(waypoints);
  if (googleResult) return googleResult;

  // Fallback: OSRM
  try {
    const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
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
