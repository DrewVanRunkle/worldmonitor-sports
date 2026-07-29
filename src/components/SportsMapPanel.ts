import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { fetchAllSportsScores, type SportsGame } from '@/services/sports-scores';
import { resolveVenueCoords } from '@/services/sports-venues';

const REFRESH_MS = 5 * 60_000;
const VIEW_W = 400;
const VIEW_H = 200;

function projectLon(lon: number): number {
  return ((lon + 180) / 360) * VIEW_W;
}

function projectLat(lat: number): number {
  return ((90 - lat) / 180) * VIEW_H;
}

function dotColor(state: SportsGame['state']): string {
  if (state === 'in') return '#2ecc71';
  if (state === 'post') return 'var(--text-dim)';
  return '#5b9bd5';
}

function renderGrid(): string {
  const lines: string[] = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = projectLon(lon).toFixed(1);
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${VIEW_H}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`);
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const y = projectLat(lat).toFixed(1);
    lines.push(`<line x1="0" y1="${y}" x2="${VIEW_W}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`);
  }
  return lines.join('');
}

interface MapPoint {
  game: SportsGame;
  leagueLabel: string;
  x: number;
  y: number;
}

function renderPoint(p: MapPoint): string {
  const label = `${p.leagueLabel}: ${p.game.awayAbbr || p.game.awayTeam} @ ${p.game.homeAbbr || p.game.homeTeam} — ${p.game.statusDetail}`;
  return `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${dotColor(p.game.state)}" fill-opacity="0.85" stroke="rgba(0,0,0,0.4)" stroke-width="1">
      <title>${escapeHtml(label)}</title>
    </circle>`;
}

export class SportsMapPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'sports-map', title: 'Sports Venue Map', showCount: false, collapsible: true });
    void this.fetchData();
    this.refreshTimer = setInterval(() => void this.fetchData(), REFRESH_MS);
  }

  public async fetchData(): Promise<boolean> {
    try {
      const boards = await fetchAllSportsScores(this.signal);
      const points: MapPoint[] = [];
      for (const board of boards) {
        for (const game of board.games) {
          const coords = resolveVenueCoords(game.venueCity, game.venueState);
          if (!coords) continue;
          points.push({ game, leagueLabel: board.leagueLabel, x: projectLon(coords.lon), y: projectLat(coords.lat) });
        }
      }

      const svg = `
        <svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="100%" height="auto" style="display:block;background:rgba(255,255,255,0.02);border-radius:6px">
          <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="none"/>
          ${renderGrid()}
          ${points.map(renderPoint).join('')}
        </svg>`;

      const legend = `
        <div style="display:flex;justify-content:center;gap:14px;padding:8px 0 0;font-size:10px;color:var(--text-dim)">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2ecc71;margin-right:4px"></span>Live</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#5b9bd5;margin-right:4px"></span>Upcoming</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--text-dim);margin-right:4px"></span>Final</span>
        </div>`;

      const emptyNote = points.length === 0
        ? '<div style="text-align:center;padding:6px;font-size:11px;color:var(--text-dim)">No resolvable venues for today\'s games</div>'
        : '';

      this.setSafeContent(unsafeRawHtml(
        `<div style="padding:8px">${svg}${legend}${emptyNote}</div>`,
        'sports venue map panel — inline SVG grid, escaped tooltip labels',
      ));
      return true;
    } catch (e) {
      if (this.isAbortError(e)) return false;
      this.showError(e instanceof Error ? e.message : 'Failed to load venue map', () => void this.fetchData());
      return false;
    }
  }

  public destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    super.destroy();
  }
}
