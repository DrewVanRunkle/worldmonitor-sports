import { Panel } from './Panel';
import { h, setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { escapeHtml } from '@/utils/sanitize';
import { parseM3u } from '@/utils/m3u-parser';
import { addStream, addStreams, clearStreams, detectKind, loadStreams, removeStream, type SportsStreamEntry } from '@/services/sports-stream-store';
import { loadFromStorage, saveToStorage } from '@/utils';
import { fetchXtreamLiveChannels, normalizeXtreamBaseUrl, XtreamImportError, type XtreamCredentials } from '@/services/xtream-codes';

// Shared across every SportsStreamsPanel instance, same as the stream list
// itself — "where my channels come from" isn't a per-panel concept.
const XC_CREDS_STORAGE_KEY = 'wm-sports-xc-creds';

function loadXtreamCreds(): XtreamCredentials | null {
  return loadFromStorage<XtreamCredentials | null>(XC_CREDS_STORAGE_KEY, null);
}

function saveXtreamCreds(creds: XtreamCredentials): void {
  saveToStorage(XC_CREDS_STORAGE_KEY, creds);
}

// Above this many channels, rendering every row expanded at once (full
// innerHTML rebuild on every click) gets noticeably sluggish — default all
// groups collapsed on first render instead so the initial paint only builds
// group headers; the user expands groups they actually want to browse.
const AUTO_COLLAPSE_THRESHOLD = 150;

const BTN_STYLE = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:var(--text);cursor:pointer;font-size:11px;padding:4px 10px;white-space:nowrap';
const INPUT_STYLE = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--text);font-size:11px;padding:5px 8px;min-width:0';

function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(?:embed|live|shorts)\/([^/?]+)/);
      if (m) return m[1] ?? null;
    }
  } catch {
    // not a valid absolute URL
  }
  return null;
}

function groupLabel(group?: string): string {
  return group && group.trim() ? group.trim() : 'Ungrouped';
}

// Xtream-Codes-style IPTV panels serve the same live channel at both .ts
// (raw MPEG-TS — no browser natively demuxes this via <video>, and hls.js
// expects an .m3u8 manifest, not a bare TS stream) and .m3u8 (HLS manifest)
// on the identical path. Swap the extension for playback; the stored entry
// keeps the original .ts URL as-imported.
function toHlsPlaybackUrl(url: string): string {
  return /\.ts(\?|$)/i.test(url) ? url.replace(/\.ts(\?|$)/i, '.m3u8$1') : url;
}

// Route through the local sidecar's SSRF-guarded proxy (src-tauri/sidecar/
// local-api-server.mjs, /api/sports-stream-proxy) instead of fetching the
// IPTV origin directly from the browser. These panels are built for VLC/Kodi
// and virtually never send CORS headers, so hls.js's fetch-based loading
// (used by every browser except Safari) gets CORB/CORS-blocked outright
// against the raw origin — same-origin via the proxy sidesteps that, and
// as a bonus upgrades http:-only providers to https: to avoid mixed content.
function toStreamProxyUrl(url: string): string {
  return `/api/sports-stream-proxy?url=${encodeURIComponent(url)}`;
}

// Same proxy, POST variant — target URL travels in a JSON body instead of
// the request's own query string. Xtream's player_api.php uses literal
// "username="/"password=" query-parameter names, and some network-level
// security appliances (DPI/IDS) flag "password=" appearing anywhere in a
// request URL as a credential-leak signature and silently block it before
// it reaches this server at all — even nested inside this proxy's own
// url= query param. Stream playback doesn't need this: Xtream embeds
// credentials as path segments there (/live/<user>/<pass>/<id>.m3u8), never
// as a named query parameter, so it never hits that pattern.
function fetchViaStreamProxy(url: string, signal: AbortSignal): Promise<Response> {
  return fetch('/api/sports-stream-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });
}

export class SportsStreamsPanel extends Panel {
  private titleInput: HTMLInputElement;
  private urlInput: HTMLInputElement;
  private m3uTextarea: HTMLTextAreaElement;
  private m3uUrlInput: HTMLInputElement;
  private xcUrlInput: HTMLInputElement;
  private xcUserInput: HTMLInputElement;
  private xcPassInput: HTMLInputElement;
  private statusEl: HTMLElement;
  private playerEl: HTMLElement;
  private listEl: HTMLElement;
  private hlsInstance: import('hls.js').default | null = null;
  private collapsedGroups = new Set<string>();
  private hasAutoCollapsed = false;

  // id/title are optional so this stays a drop-in `new SportsStreamsPanel()`
  // for the statically-registered base panel; extra multiscreen instances
  // (see src/services/sports-streams-instances.ts) pass their own generated
  // id and title. All instances read/write the same shared stream list —
  // only which stream is currently playing differs per instance.
  constructor(id = 'sports-streams', title = 'My Live Streams') {
    super({ id, title, showCount: false, collapsible: true });

    this.titleInput = h('input', { type: 'text', placeholder: 'Title (optional)', style: `${INPUT_STYLE};flex:1` }) as HTMLInputElement;
    this.urlInput = h('input', { type: 'text', placeholder: 'Stream URL (YouTube / .m3u8 / embed link)', style: `${INPUT_STYLE};flex:2` }) as HTMLInputElement;
    const addBtn = h('button', { type: 'button', style: BTN_STYLE, onClick: () => this.handleAddLink() }, 'Add');

    this.m3uTextarea = h('textarea', {
      placeholder: 'Paste M3U playlist text here (#EXTM3U ...) — the reliable way to import your own playlist',
      rows: '3',
      style: `${INPUT_STYLE};width:100%;resize:vertical;box-sizing:border-box`,
    }) as HTMLTextAreaElement;
    const importTextBtn = h('button', { type: 'button', style: BTN_STYLE, onClick: () => this.handleImportText() }, 'Import pasted playlist');

    this.m3uUrlInput = h('input', { type: 'text', placeholder: 'Playlist URL (best-effort — often blocked by CORS)', style: `${INPUT_STYLE};flex:1` }) as HTMLInputElement;
    const importUrlBtn = h('button', { type: 'button', style: BTN_STYLE, onClick: () => void this.handleImportUrl() }, 'Load from URL');

    // Xtream Codes (XC) panels expose a JSON API listing every channel —
    // no clipboard/textarea size limit, and more reliable than parsing M3U
    // text for providers with thousands of channels.
    const savedCreds = loadXtreamCreds();
    this.xcUrlInput = h('input', { type: 'text', placeholder: 'XC server URL (host:port)', value: savedCreds?.baseUrl ?? '', style: `${INPUT_STYLE};flex:2` }) as HTMLInputElement;
    this.xcUserInput = h('input', { type: 'text', placeholder: 'Username', value: savedCreds?.username ?? '', style: `${INPUT_STYLE};flex:1` }) as HTMLInputElement;
    this.xcPassInput = h('input', { type: 'password', placeholder: 'Password', value: savedCreds?.password ?? '', style: `${INPUT_STYLE};flex:1` }) as HTMLInputElement;
    const xcFetchBtn = h('button', { type: 'button', style: BTN_STYLE, onClick: () => void this.handleXtreamFetch() }, 'Fetch channels');

    const addPanelBtn = h('button', {
      type: 'button',
      style: BTN_STYLE,
      title: 'Add another Live Streams panel so you can watch multiple channels at once',
      onClick: () => this.element.dispatchEvent(new CustomEvent('wm:sports-streams-add', { bubbles: true })),
    }, '+ Multiscreen panel');

    const clearAllBtn = h('button', {
      type: 'button',
      style: BTN_STYLE,
      title: 'Remove every imported channel so you can start over with a fresh playlist',
      onClick: () => this.handleClearAll(),
    }, 'Clear all channels');

    this.statusEl = h('div', { style: 'font-size:10px;color:var(--text-dim);min-height:14px;padding:2px 0' });

    this.playerEl = h('div', { className: 'sports-stream-player' });
    this.listEl = h('div', { className: 'sports-stream-list' });
    this.listEl.addEventListener('click', (e) => this.handleListClick(e));

    const formSection = h('div', { style: 'padding:8px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:6px' },
      h('div', { style: 'display:flex;gap:6px' }, this.titleInput, this.urlInput, addBtn),
      this.m3uTextarea,
      h('div', { style: 'display:flex;gap:6px' }, importTextBtn),
      h('div', { style: 'display:flex;gap:6px' }, this.m3uUrlInput, importUrlBtn),
      h('div', { style: 'display:flex;gap:6px' }, this.xcUrlInput, this.xcUserInput, this.xcPassInput, xcFetchBtn),
      h('div', { style: 'display:flex;gap:6px' }, addPanelBtn, clearAllBtn),
      this.statusEl,
    );

    this.content.replaceChildren(formSection, this.playerEl, this.listEl);
    this.renderList();
  }

  private setStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }

  private handleAddLink(): void {
    const url = this.urlInput.value.trim();
    if (!url) {
      this.setStatus('Enter a URL first');
      return;
    }
    addStream(this.titleInput.value, url);
    this.titleInput.value = '';
    this.urlInput.value = '';
    this.setStatus('Added');
    this.renderList();
  }

  private handleClearAll(): void {
    const count = loadStreams().length;
    if (count === 0) {
      this.setStatus('No channels to clear');
      return;
    }
    if (!window.confirm(`Remove all ${count} imported channel${count === 1 ? '' : 's'}? This can't be undone.`)) return;
    clearStreams();
    this.collapsedGroups.clear();
    this.hasAutoCollapsed = false;
    this.setStatus('Cleared all channels');
    this.renderList();
  }

  private handleImportText(): void {
    const raw = this.m3uTextarea.value;
    if (!raw.trim()) {
      this.setStatus('Paste playlist text first');
      return;
    }
    const entries = parseM3u(raw);
    if (entries.length === 0) {
      this.setStatus('No channels found in pasted text');
      return;
    }
    const result = addStreams(entries);
    this.m3uTextarea.value = '';
    this.setStatus(this.formatImportStatus(result));
    this.renderList();
  }

  private formatImportStatus(result: { added: number; duplicates: number; droppedForCap: number }): string {
    const { added, duplicates, droppedForCap } = result;
    const parts = [`Imported ${added} channel${added === 1 ? '' : 's'}`];
    if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`);
    if (droppedForCap > 0) parts.push(`${droppedForCap} oldest channel${droppedForCap === 1 ? '' : 's'} dropped to stay under the library limit`);
    return parts.length === 1 ? parts[0]! : `${parts[0]} (${parts.slice(1).join(', ')})`;
  }

  private async handleImportUrl(): Promise<void> {
    const url = this.m3uUrlInput.value.trim();
    if (!url) {
      this.setStatus('Enter a playlist URL first');
      return;
    }
    this.setStatus('Fetching playlist…');
    try {
      const resp = await fetch(url, { signal: this.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const entries = parseM3u(text);
      if (entries.length === 0) {
        this.setStatus('No channels found at that URL');
        return;
      }
      const result = addStreams(entries);
      this.m3uUrlInput.value = '';
      this.setStatus(this.formatImportStatus(result));
      this.renderList();
    } catch (e) {
      if (this.isAbortError(e)) return;
      this.setStatus('Failed to fetch — likely blocked by CORS. Paste the playlist text above instead.');
    }
  }

  private async handleXtreamFetch(): Promise<void> {
    const baseUrl = normalizeXtreamBaseUrl(this.xcUrlInput.value);
    const username = this.xcUserInput.value.trim();
    const password = this.xcPassInput.value;
    if (!baseUrl) {
      this.setStatus('Enter a valid XC server URL (host:port)');
      return;
    }
    if (!username || !password) {
      this.setStatus('Enter your XC username and password');
      return;
    }

    this.setStatus('Fetching channels from server…');
    const creds = { baseUrl, username, password };
    try {
      const entries = await fetchXtreamLiveChannels(creds, (url) =>
        fetchViaStreamProxy(url, this.signal),
      );
      if (entries.length === 0) {
        this.setStatus('Connected, but no live channels were returned');
        return;
      }
      saveXtreamCreds(creds);
      const result = addStreams(entries);
      this.setStatus(this.formatImportStatus(result));
      this.renderList();
    } catch (e) {
      if (this.isAbortError(e)) return;
      this.setStatus(e instanceof XtreamImportError ? e.message : 'Failed to reach the XC server — check the URL and your network');
    }
  }

  private handleListClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const playId = target.closest<HTMLElement>('[data-stream-play]')?.dataset.streamPlay;
    if (playId) {
      this.playStream(playId);
      return;
    }
    const removeId = target.closest<HTMLElement>('[data-stream-remove]')?.dataset.streamRemove;
    if (removeId) {
      removeStream(removeId);
      this.renderList();
      return;
    }
    const groupToggle = target.closest<HTMLElement>('[data-stream-group-toggle]')?.dataset.streamGroupToggle;
    if (groupToggle) {
      if (this.collapsedGroups.has(groupToggle)) this.collapsedGroups.delete(groupToggle);
      else this.collapsedGroups.add(groupToggle);
      this.renderList();
    }
  }

  private renderList(): void {
    const streams = loadStreams();
    if (streams.length === 0) {
      setTrustedHtml(this.listEl, trustedHtml(
        '<div style="text-align:center;padding:12px;font-size:11px;color:var(--text-dim)">No streams yet — add a link or import a playlist above</div>',
        'sports streams panel — static empty state',
      ));
      return;
    }

    const groups = new Map<string, SportsStreamEntry[]>();
    for (const s of streams) {
      const g = groupLabel(s.group);
      const list = groups.get(g) ?? [];
      list.push(s);
      groups.set(g, list);
    }

    // One-time default for large libraries: collapse everything so the first
    // paint only builds group headers, not thousands of channel rows. Only
    // applies once, before the user has touched any group — after that their
    // manual collapse/expand choices are left alone on every re-render.
    if (!this.hasAutoCollapsed) {
      this.hasAutoCollapsed = true;
      if (streams.length > AUTO_COLLAPSE_THRESHOLD) {
        for (const group of groups.keys()) this.collapsedGroups.add(group);
      }
    }

    const html = Array.from(groups.entries()).map(([group, entries]) => {
      const collapsed = this.collapsedGroups.has(group);
      return `
      <div style="margin-bottom:8px">
        <button type="button" data-stream-group-toggle="${escapeHtml(group)}" aria-expanded="${!collapsed}" style="display:flex;align-items:center;gap:5px;width:100%;background:none;border:none;cursor:pointer;font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;padding:4px 8px;text-align:left">
          <span style="display:inline-block;font-size:9px;transition:transform 0.15s;transform:rotate(${collapsed ? '-90deg' : '0deg'})">▾</span>
          <span>${escapeHtml(group)} (${entries.length})</span>
        </button>
        ${collapsed ? '' : entries.map(entry => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.04)">
            <button type="button" data-stream-play="${escapeHtml(entry.id)}" style="background:none;border:none;color:var(--text);cursor:pointer;text-align:left;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0;font-size:12px">▶ ${escapeHtml(entry.title)}</button>
            <button type="button" data-stream-remove="${escapeHtml(entry.id)}" aria-label="Remove" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;padding:0 4px">✕</button>
          </div>`).join('')}
      </div>`;
    }).join('');

    setTrustedHtml(this.listEl, trustedHtml(html, 'sports streams panel — escaped title/group text'));
  }

  private renderPlayerMessage(msg: string): void {
    const div = document.createElement('div');
    div.style.cssText = 'padding:12px;text-align:center;font-size:11px;color:var(--text-dim)';
    div.textContent = msg;
    this.playerEl.replaceChildren(div);
  }

  private playStream(id: string): void {
    const stored = loadStreams().find(s => s.id === id);
    if (!stored) return;
    this.teardownPlayer();
    // Recompute kind fresh rather than trust the persisted value — entries
    // imported before a detectKind change shipped would otherwise stay
    // misclassified (e.g. stuck as 'iframe') until manually re-imported.
    const stream: SportsStreamEntry = { ...stored, kind: detectKind(stored.url) };

    if (stream.kind === 'youtube') {
      const videoId = extractYoutubeId(stream.url);
      if (!videoId) {
        this.renderPlayerMessage('Could not parse a YouTube video/live ID from that URL.');
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      iframe.title = stream.title;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:6px';
      this.playerEl.replaceChildren(iframe);
      return;
    }

    if (stream.kind === 'hls') {
      void this.playHls(stream);
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.src = stream.url;
    iframe.title = stream.title;
    iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-presentation');
    iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:6px';
    this.playerEl.replaceChildren(iframe);
  }

  private async playHls(stream: SportsStreamEntry): Promise<void> {
    const swappedUrl = toHlsPlaybackUrl(stream.url);
    const playbackUrl = toStreamProxyUrl(swappedUrl);
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.style.cssText = 'width:100%;aspect-ratio:16/9;border-radius:6px;background:#000';
    this.playerEl.replaceChildren(video);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl;
      // The .ts -> .m3u8 swap is a heuristic (holds for Xtream-Codes-style
      // panels, not guaranteed for every provider) — if it was wrong, retry
      // the original URL once before giving up visibly instead of silently.
      video.onerror = () => {
        if (swappedUrl !== stream.url) {
          video.onerror = null;
          video.src = toStreamProxyUrl(stream.url);
        } else {
          this.renderPlayerMessage('Failed to load this stream.');
        }
      };
      return;
    }

    try {
      const { default: Hls } = await import('hls.js');
      if (!Hls.isSupported()) {
        this.renderPlayerMessage('HLS playback is not supported in this browser.');
        return;
      }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      this.hlsInstance = hls;
      let triedOriginal = swappedUrl === stream.url;
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (!triedOriginal) {
          triedOriginal = true;
          hls.loadSource(toStreamProxyUrl(stream.url));
          return;
        }
        this.renderPlayerMessage('Failed to load this stream.');
      });
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
    } catch {
      this.renderPlayerMessage('Failed to load HLS player.');
    }
  }

  private teardownPlayer(): void {
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }
  }

  public destroy(): void {
    this.teardownPlayer();
    super.destroy();
  }
}
