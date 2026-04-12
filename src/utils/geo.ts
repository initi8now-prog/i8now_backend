/* ═══════════════════════════════════════════════════════════════════════════
 *  geo — Haversine distance on the WGS84 sphere (same as maps “as the crow flies”)
 *
 *  Used for shift discovery: compare worker lat/lng to shift venue coordinates.
 *  Returns kilometres, rounded to one decimal for API responses.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Great-circle distance between two WGS84 points in **kilometres**.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const km = R * c
  return Math.round(km * 10) / 10
}

/**
 * Great-circle distance between two WGS84 points in **metres** (from haversine km).
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.round(haversineKm(lat1, lng1, lat2, lng2) * 1000)
}
