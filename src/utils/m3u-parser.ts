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
const URL_IN_LINE_RE = /(https?:\/\/\S+)/;

/**
 * Recover real line breaks when a paste collapsed them (e.g. copied from a
 * rendered/wrapped display rather than the raw file — visually multi-line
 * but with no literal \n characters). Heuristic: if there are meaningfully
 * more #EXT tags than actual line breaks, re-split before every tag.
 */
function recoverLineBreaks(text: string): string {
  const tagCount = (text.match(/#EXT/g) ?? []).length;
  const lineCount = text.split(/\r?\n/).length;
  if (tagCount > 1 && tagCount > lineCount) {
    return text.replace(/#EXT/g, '\n#EXT');
  }
  return text;
}

/**
 * A #EXTINF line with its stream URL glued onto the same physical line
 * (same collapsed-paste symptom, one level down) gets split into the
 * metadata line and a standalone URL line. Only searches the channel-name
 * portion AFTER the attribute-list comma — attribute values like
 * tvg-logo="http://..." live BEFORE that comma and must never match here,
 * or every normal line with a logo attribute would get corrupted.
 */
function splitGluedUrls(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const commaIdx = line.indexOf(',');
      if (commaIdx >= 0) {
        const titlePart = line.slice(commaIdx + 1);
        const match = titlePart.match(URL_IN_LINE_RE);
        if (match?.index !== undefined) {
          const cleanTitle = titlePart.slice(0, match.index).trim();
          result.push(`${line.slice(0, commaIdx + 1)}${cleanTitle}`.trim());
          result.push(match[1]!);
          continue;
        }
      }
    }
    result.push(line);
  }
  return result;
}

export function parseM3u(text: string): M3uEntry[] {
  const rawLines = recoverLineBreaks(text).split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const lines = splitGluedUrls(rawLines);
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
