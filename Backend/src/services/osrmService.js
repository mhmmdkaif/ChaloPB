const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

function toCoordinatePair(stop) {
  const lat = Number(stop.latitude);
  const lng = Number(stop.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Invalid stop coordinates");
  }

  return `${lng},${lat}`;
}

export async function getOsrmRouteGeometry(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error("At least 2 ordered stops are required to build geometry");
  }

  const coords = stops.map(toCoordinatePair).join(";");
  const endpoint = `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OSRM request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const route = payload?.routes?.[0];

  if (!route?.geometry || route.geometry.type !== "LineString") {
    throw new Error("OSRM did not return a valid route geometry");
  }

  return {
    geometry: route.geometry,
    distance: Number.isFinite(route.distance) ? Math.round(route.distance) : null,
    duration: Number.isFinite(route.duration) ? Math.round(route.duration) : null,
  };
}
