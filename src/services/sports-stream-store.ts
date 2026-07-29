// Personal-use widget (VITE_ENABLE_SPORTS): localStorage-backed list of the
// user's own stream links (YouTube/HLS/generic embeds they have legitimate
// access to). Modeled on widget-store.ts's loadWidgets/saveWidget pattern —
// per-browser, no backend.
import { generateId, loadFromStorage, saveToStorage } from '@/utils';

const STORAGE_KEY = 'wm-sports-streams';
// Full IPTV packages routinely ship 1000+ channels. At the JSON size of a
// typical entry (title/url/group, url often carrying a long signed token)
// 5000 entries lands around 2-3MB — comfortable headroom under the ~5-10MB
// per-origin localStorage quota most browsers give, alongside everything
// else this app already stores there.
const MAX_STREAMS = 5000;
const MAX_TITLE_CHARS = 100;
const MAX_URL_CHARS = 2000;

export interface SportsStreamEntry {
  id: string;
  title: string;
  url: string;
  kind: 'youtube' | 'hls' | 'iframe';
  group?: string;
}

/** Exported so callers can recompute kind at use time rather than trust a
 * possibly-stale persisted value (e.g. entries imported before a detectKind
 * change shipped — see SportsStreamsPanel.playStream). */
export function detectKind(url: string): SportsStreamEntry['kind'] {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  // .ts here is a raw MPEG-TS live stream link (common Xtream-Codes-style
  // IPTV panel path: /live/<user>/<pass>/<id>.ts), not a TypeScript file —
  // route it through the HLS player same as .m3u8; SportsStreamsPanel swaps
  // the extension to .m3u8 at playback time since raw .ts isn't directly
  // playable via <video>/hls.js, but the .m3u8 sibling on the same path is.
  if (/\.m3u8(\?|$)/.test(u) || /\.ts(\?|$)/.test(u)) return 'hls';
  return 'iframe';
}

function buildEntry(title: string, url: string, group?: string): SportsStreamEntry | null {
  const trimmedUrl = url.trim().slice(0, MAX_URL_CHARS);
  if (!trimmedUrl) return null;
  const trimmedTitle = title.trim().slice(0, MAX_TITLE_CHARS);
  return {
    id: generateId(),
    title: trimmedTitle || trimmedUrl,
    url: trimmedUrl,
    kind: detectKind(trimmedUrl),
    group: group?.trim().slice(0, MAX_TITLE_CHARS) || undefined,
  };
}

export function loadStreams(): SportsStreamEntry[] {
  return loadFromStorage<SportsStreamEntry[]>(STORAGE_KEY, []);
}

export function addStream(title: string, url: string, group?: string): SportsStreamEntry | null {
  const entry = buildEntry(title, url, group);
  if (!entry) return null;
  const existing = loadStreams().filter(s => s.url !== entry.url);
  const updated = [...existing, entry].slice(-MAX_STREAMS);
  saveToStorage(STORAGE_KEY, updated);
  return entry;
}

export interface AddStreamsResult {
  /** New, non-duplicate candidates found in this batch (before any cap eviction). */
  added: number;
  /** Candidates skipped because their URL already exists (existing entries or earlier in this same batch). */
  duplicates: number;
  /** Entries (old or new) evicted from the combined list to stay at MAX_STREAMS. 0 unless the cap was actually hit. */
  droppedForCap: number;
}

/** Bulk-add from a parsed M3U playlist. Dedupes by URL against existing entries and within the batch. */
export function addStreams(candidates: Array<{ title: string; url: string; group?: string }>): AddStreamsResult {
  const existing = loadStreams();
  const seenUrls = new Set(existing.map(s => s.url));
  const toAdd: SportsStreamEntry[] = [];
  let duplicates = 0;

  for (const candidate of candidates) {
    const entry = buildEntry(candidate.title, candidate.url, candidate.group);
    if (!entry) continue;
    if (seenUrls.has(entry.url)) { duplicates++; continue; }
    seenUrls.add(entry.url);
    toAdd.push(entry);
  }

  if (toAdd.length === 0) return { added: 0, duplicates, droppedForCap: 0 };
  const combined = [...existing, ...toAdd];
  const updated = combined.slice(-MAX_STREAMS);
  saveToStorage(STORAGE_KEY, updated);
  return { added: toAdd.length, duplicates, droppedForCap: combined.length - updated.length };
}

export function removeStream(id: string): void {
  const updated = loadStreams().filter(s => s.id !== id);
  saveToStorage(STORAGE_KEY, updated);
}

/** Wipes every stored stream. Shared across every multiscreen panel instance, same as loadStreams()/addStreams(). */
export function clearStreams(): void {
  saveToStorage(STORAGE_KEY, []);
}
