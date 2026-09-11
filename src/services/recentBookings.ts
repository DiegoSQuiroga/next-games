const REFERENCE_PATTERN = /^NG-(?:[2-9A-HJ-NP-Z]{12}|\d{4,})$/
const KEY = 'next-games-recent-booking-references'
export function getRecentBookingReferences(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string' && REFERENCE_PATTERN.test(r)).slice(0, 5) : []
  } catch { return [] }
}
export function rememberBookingReference(reference: string): void {
  if (!REFERENCE_PATTERN.test(reference)) return
  try { localStorage.setItem(KEY, JSON.stringify([reference, ...getRecentBookingReferences().filter(r => r !== reference)].slice(0, 5))) } catch {
    // Storage restrictions must never turn a successful server booking into an apparent failure.
  }
}
