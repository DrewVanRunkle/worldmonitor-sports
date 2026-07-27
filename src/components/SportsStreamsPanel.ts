import { Panel } from './Panel';
import { h, setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { escapeHtml } from '@/utils/sanitize';
import { parseM3u } from '@/utils/m3u-parser';
import { addStream, addStreams, loadStreams, removeStream, type SportsStreamEntry } from '@/services/sports-stream-store';

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

export class SportsStreamsPanel extends Panel {
  private titleInput: HTMLInputElement;
  private urlInput: HTMLInputElement;
  private m3uTextarea: HTMLTextAreaElement;
  private m3uUrlInput: HTMLInputElement;
  private statusEl: HTMLElement;
  private playerEl: HTMLElement;
  private listEl: HTMLElement;
  private hlsInstance: import('hls.js').default | null = null;

  constructor() {
    super({ id: 'sports-streams', title: 'My Live Streams', showCount: false, collapsible: true });

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

    this.statusEl = h('div', { style: 'font-size:10px;color:var(--text-dim);min-height:14px;padding:2px 0' });

    this.playerEl = h('div', { className: 'sports-stream-player' });
    this.listEl = h('div', { className: 'sports-stream-list' });
    this.listEl.addEventListener('click', (e) => this.handleListClick(e));

    const formSection = h('div', { style: 'padding:8px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:6px' },
      h('div', { style: 'display:flex;gap:6px' }, this.titleInput, this.urlInput, addBtn),
      this.m3uTextarea,
      h('div', { style: 'display:flex;gap:6px' }, importTextBtn),
      h('div', { style: 'display:flex;gap:6px' }, this.m3uUrlInput, importUrlBtn),
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
    const added = addStreams(entries);
    const skipped = entries.length - added;
    this.m3uTextarea.value = '';
    this.setStatus(`Imported ${added} channel${added === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} duplicate${skipped === 1 ? '' : 's'} skipped)` : ''}`);
    this.renderList();
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
      const added = addStreams(entries);
      this.m3uUrlInput.value = '';
      this.setStatus(`Imported ${added} channel${added === 1 ? '' : 's'} from URL`);
      this.renderList();
    } catch (e) {
      if (this.isAbortError(e)) return;
      this.setStatus('Failed to fetch — likely blocked by CORS. Paste the playlist text above instead.');
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

    const html = Array.from(groups.entries()).map(([group, entries]) => `
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;padding:4px 8px">${escapeHtml(group)}</div>
        ${entries.map(entry => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.04)">
            <button type="button" data-stream-play="${escapeHtml(entry.id)}" style="background:none;border:none;color:var(--text);cursor:pointer;text-align:left;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0;font-size:12px">▶ ${escapeHtml(entry.title)}</button>
            <button type="button" data-stream-remove="${escapeHtml(entry.id)}" aria-label="Remove" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;padding:0 4px">✕</button>
          </div>`).join('')}
      </div>`).join('');

    setTrustedHtml(this.listEl, trustedHtml(html, 'sports streams panel — escaped title/group text'));
  }

  private renderPlayerMessage(msg: string): void {
    const div = document.createElement('div');
    div.style.cssText = 'padding:12px;text-align:center;font-size:11px;color:var(--text-dim)';
    div.textContent = msg;
    this.playerEl.replaceChildren(div);
  }

  private playStream(id: string): void {
    const stream = loadStreams().find(s => s.id === id);
    if (!stream) return;
    this.teardownPlayer();

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
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.style.cssText = 'width:100%;aspect-ratio:16/9;border-radius:6px;background:#000';
    this.playerEl.replaceChildren(video);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = stream.url;
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
      hls.loadSource(stream.url);
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
