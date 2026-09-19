// Small input-validation helpers (hardening pass) — this backend has no auth at all (by
// design: no accounts, session codes are the only "identity"), so every route is reachable by
// anyone who finds the URL. These exist to stop malformed or oversized input from wasting
// storage, breaking rendering, or fanning out into expensive work, not to add an auth layer.

export function isNonEmptyString(v: unknown, maxLen = 200): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

export function isOptionalString(v: unknown, maxLen = 200): v is string | undefined {
  return v === undefined || isNonEmptyString(v, maxLen) || v === '';
}

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function isFiniteNumberInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/** Matches the 4-char session codes StageScreen generates (customAlphabet, uppercase+digits). */
export function isValidSessionCode(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Z0-9]{4,8}$/.test(v);
}

/** Matches nanoid(8) gallery entry IDs — alphanumeric plus the URL-safe nanoid alphabet chars. */
export function isValidEntryId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{4,32}$/.test(v);
}

/** Confirms a URL actually points at this project's own Vercel Blob store, not anywhere else —
 * used wherever a client hands back a URL it claims it already uploaded to, so a malicious
 * client can't get an arbitrary URL broadcast to other peers or recorded on a gallery entry. */
export function isOwnBlobUrl(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 500 && /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(v);
}
