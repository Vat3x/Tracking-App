const GOOGLE_DIRECTIONS_BASE = "https://maps.googleapis.com/maps/api/directions/json";
const GOOGLE_MAPS_KEY = "AIzaSyCNzAjZeOqR_1bzGHb7zZEWhiyTFKX_Ju0";
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export interface RouteResult {
  /** Coordinates [lng, lat][] for the full route */
  coordinates: [number, number][];
  /** Total distance in meters */
  distance: number;
  /** Total duration in seconds */
  duration: number;
}

/**
 * Decode Google Maps encoded polyline string into [lng, lat] pairs.
 */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lng / 1e5, lat / 1e5]);
  }

  return points;
}

/**
 * Try Google Directions API first, fall back to OSRM.
 */
export async function fetchRoute(
  waypoints: [number, number][] // [lng, lat][]
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  // 1. Try Google Directions API
  const googleResult = await fetchGoogleRoute(waypoints);
  if (googleResult) return googleResult;

  // 2. Fall back to OSRM
  const osrmResult = await fetchOsrmRoute(waypoints);
  if (osrmResult) return osrmResult;

  console.warn("Both Google and OSRM routing failed");
  return null;
}

async function fetchGoogleRoute(
  waypoints: [number, number][]
): Promise<RouteResult | null> {
  try {
    const origin = `${waypoints[0][1]},${waypoints[0][0]}`;
    const destination = `${waypoints[waypoints.length - 1][1]},${waypoints[waypoints.length - 1][0]}`;

    let url = `${GOOGLE_DIRECTIONS_BASE}?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_KEY}&departure_time=now&traffic_model=best_guess`;

    if (waypoints.length > 2) {
      const intermediate = waypoints
        .slice(1, -1)
        .map(([lng, lat]) => `${lat},${lng}`)
        .join("|");
      url += `&waypoints=${intermediate}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.routes?.[0]) {
      console.warn("Google Directions API status:", data.status, data.error_message ?? "");
      return null;
    }

    const route = data.routes[0];
    const coordinates = decodePolyline(route.overview_polyline.points);

    let totalDistance = 0;
    let totalDuration = 0;
    for (const leg of route.legs) {
      totalDistance += leg.distance.value;
      // Use traffic-aware duration when available, fall back to standard duration
      totalDuration += (leg.duration_in_traffic?.value ?? leg.duration.value);
    }

    return { coordinates, distance: totalDistance, duration: totalDuration };
  } catch (e) {
    console.warn("Google Directions API error:", e);
    return null;
  }
}

async function fetchOsrmRoute(
  waypoints: [number, number][]
): Promise<RouteResult | null> {
  try {
    const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
    const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes?.[0]) {
      console.warn("OSRM status:", data.code, data.message ?? "");
      return null;
    }

    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance,
      duration: route.duration,
    };
  } catch (e) {
    console.warn("OSRM error:", e);
    return null;
  }
}
