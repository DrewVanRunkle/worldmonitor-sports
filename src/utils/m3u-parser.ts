// Minimal parser for M3U/M3U8 *playlist* text (not media segment playlists —
// this reads the `#EXTM3U` / `#EXTINF` channel-list format IPTV providers
// hand out, e.g. `#EXTINF:-1 group-title="Sports",Channel Name` followed by
// a stream URL line). Plain text format, no dependency needed.

export interface M3uEntry {
  title: string;
  url: string;
  group?: string;
}

const GROUP_TITLE_RE = /group-title="([^"]*)"/i;

export function parseM3u(text: string): M3uEntry[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const entries: M3uEntry[] = [];
  let pendingTitle: string | null = null;
  let pendingGroup: string | undefined;

  for (const line of lines) {
    if (line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF')) {
      const commaIdx = line.indexOf(',');
      pendingTitle = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : null;
      pendingGroup = line.match(GROUP_TITLE_RE)?.[1] || undefined;
      continue;
    }

    if (line.startsWith('#')) continue; // other directives (#EXTGRP, #EXTVLCOPT, ...) — ignored

    entries.push({
      title: pendingTitle || line,
      url: line,
      group: pendingGroup,
    });
    pendingTitle = null;
    pendingGroup = undefined;
  }

  return entries;
}
