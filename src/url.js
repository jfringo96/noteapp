/**
 * Turning what someone typed into something safe to hand the operating system.
 *
 * Nothing here fetches anything. Opening a link or a place is only ever
 * "build a URL, give it to the browser" — the app itself never touches the
 * network.
 */

/** Only http and https are ever handed out. */
export function isWebUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Adds https:// to something typed as "example.com". */
export function normaliseUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

/**
 * Where a place card should open.
 *
 * A pasted Maps URL is used as-is — that is the whole point of being able to
 * paste one. Anything else becomes a Google Maps search, which happily accepts
 * a place name, a postcode, or "51.5072,-0.1276".
 */
export function mapsUrlFor(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return "";

  const asUrl = normaliseUrl(trimmed);
  if (/^https?:\/\//i.test(trimmed) && isWebUrl(asUrl)) return asUrl;

  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(trimmed);
}
