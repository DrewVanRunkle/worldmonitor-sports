// Personal-use widget (VITE_ENABLE_SPORTS): localStorage-backed list of the
// user's own stream links (YouTube/HLS/generic embeds they have legitimate
// access to). Modeled on widget-store.ts's loadWidgets/saveWidget pattern —
// per-browser, no backend.
import { generateId, loadFromStorage, saveToStorage } from '@/utils';

const STORAGE_KEY = 'wm-sports-streams';
const MAX_STREAMS = 200;
const MAX_TITLE_CHARS = 100;
const MAX_URL_CHARS = 2000;

export interface SportsStreamEntry {
  id: string;
  title: string;
  url: string;
  kind: 'youtube' | 'hls' | 'iframe';
  group?: string;
}

function detectKind(url: string): SportsStreamEntry['kind'] {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('.m3u8')) return 'hls';
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

/** Bulk-add from a parsed M3U playlist. Dedupes by URL against existing entries and within the batch. Returns the number actually added. */
export function addStreams(candidates: Array<{ title: string; url: string; group?: string }>): number {
  const existing = loadStreams();
  const seenUrls = new Set(existing.map(s => s.url));
  const toAdd: SportsStreamEntry[] = [];

  for (const candidate of candidates) {
    const entry = buildEntry(candidate.title, candidate.url, candidate.group);
    if (!entry || seenUrls.has(entry.url)) continue;
    seenUrls.add(entry.url);
    toAdd.push(entry);
  }

  if (toAdd.length === 0) return 0;
  const updated = [...existing, ...toAdd].slice(-MAX_STREAMS);
  saveToStorage(STORAGE_KEY, updated);
  return toAdd.length;
}

export function removeStream(id: string): void {
  const updated = loadStreams().filter(s => s.id !== id);
  saveToStorage(STORAGE_KEY, updated);
}
