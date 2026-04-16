/* ═══════════════════════════════════════════════════════════════════════════
 *  rating — numeric helpers for profile averages (worker / employer)
 *
 *  All API layers should use safeRatingAvg when serialising so null/NaN never
 *  leak to JSON as invalid numbers.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Clamps to 2 decimal places; unknown → 0 (never NaN). */
export function safeRatingAvg(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/** Running mean after one new 1–5 star rating (count is previous number of ratings). */
export function nextRunningAverage(oldAvg: unknown, oldCount: unknown, stars: number): number {
  const oa = safeRatingAvg(oldAvg)
  const oc = typeof oldCount === 'number' && oldCount >= 0 ? Math.floor(oldCount) : 0
  const nc = oc + 1
  return Math.round(((oa * oc + stars) / nc) * 100) / 100
}
