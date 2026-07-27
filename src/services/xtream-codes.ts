// Xtream-Codes-style IPTV panel API client (player_api.php). Lets the user
// enter their server/username/password once instead of copy-pasting a
// playlist that can run to thousands of lines — the same panels this app's
// sports-stream-proxy already talks to for playback also expose a JSON API
// listing every live channel, which is both more reliable to parse than
// M3U text and avoids the clipboard entirely.

export interface XtreamCredentials {
  baseUrl: string;
  username: string;
  password: string;
}

export interface XtreamImportEntry {
  title: string;
  url: string;
  group?: string;
}

interface XtreamCategory {
  category_id?: string | number;
  category_name?: string;
}

interface XtreamLiveStream {
  stream_id?: string | number;
  name?: string;
  category_id?: string | number;
}

/** Normalizes user input ("host:port", "http://host:port/", etc.) into a bare http(s) origin with no trailing slash. */
export function normalizeXtreamBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  // Reject an explicit non-http(s) scheme outright rather than blindly
  // prepending http:// on top of it, which would silently mangle e.g.
  // "ftp://host" into the nonsense-but-parseable "http://ftp" instead of
  // failing cleanly.
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
  const withScheme = hasScheme ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function buildApiUrl(creds: XtreamCredentials, action?: string): string {
  const url = new URL(`${creds.baseUrl}/player_api.php`);
  url.searchParams.set('username', creds.username);
  url.searchParams.set('password', creds.password);
  if (action) url.searchParams.set('action', action);
  return url.toString();
}

function buildLiveStreamUrl(creds: XtreamCredentials, streamId: string | number): string {
  const encodedUser = encodeURIComponent(creds.username);
  const encodedPass = encodeURIComponent(creds.password);
  return `${creds.baseUrl}/live/${encodedUser}/${encodedPass}/${streamId}.m3u8`;
}

export class XtreamImportError extends Error {}

/**
 * fetchImpl lets the caller route through the local SSRF-guarded stream
 * proxy (sports-stream-proxy) instead of a raw browser fetch — these panels
 * generally don't send CORS headers, same reason playback needs the proxy.
 */
export async function fetchXtreamLiveChannels(
  creds: XtreamCredentials,
  fetchImpl: (url: string) => Promise<Response>,
): Promise<XtreamImportEntry[]> {
  const [categoriesRes, streamsRes] = await Promise.all([
    fetchImpl(buildApiUrl(creds, 'get_live_categories')),
    fetchImpl(buildApiUrl(creds, 'get_live_streams')),
  ]);

  if (!categoriesRes.ok || !streamsRes.ok) {
    throw new XtreamImportError(`Server responded with an error (HTTP ${!categoriesRes.ok ? categoriesRes.status : streamsRes.status})`);
  }

  let categoriesJson: unknown;
  let streamsJson: unknown;
  try {
    [categoriesJson, streamsJson] = await Promise.all([categoriesRes.json(), streamsRes.json()]);
  } catch {
    throw new XtreamImportError('Server did not return valid JSON — check the server URL');
  }

  // Invalid credentials typically come back as a non-array (e.g. an empty
  // object or {"user_info":{"auth":0}}) rather than an HTTP error status.
  if (!Array.isArray(streamsJson)) {
    throw new XtreamImportError('No channels returned — check your username/password');
  }

  const categoryNames = new Map<string, string>();
  if (Array.isArray(categoriesJson)) {
    for (const cat of categoriesJson as XtreamCategory[]) {
      if (cat.category_id != null && cat.category_name) {
        categoryNames.set(String(cat.category_id), cat.category_name);
      }
    }
  }

  const entries: XtreamImportEntry[] = [];
  for (const stream of streamsJson as XtreamLiveStream[]) {
    if (stream.stream_id == null || !stream.name) continue;
    entries.push({
      title: stream.name,
      url: buildLiveStreamUrl(creds, stream.stream_id),
      group: stream.category_id != null ? categoryNames.get(String(stream.category_id)) : undefined,
    });
  }
  return entries;
}
