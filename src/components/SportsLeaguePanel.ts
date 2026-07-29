import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { fetchSingleLeagueScores, isLeagueInSeason, type LeagueKey, type SportsGame } from '@/services/sports-scores';

const REFRESH_MS = 60_000;

function stateColor(state: SportsGame['state']): string {
  if (state === 'in') return '#2ecc71';
  return 'var(--text-dim)';
}

function renderGame(game: SportsGame): string {
  const live = game.state === 'in';
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(game.awayAbbr || game.awayTeam)}</span>
          <span style="font-weight:600">${escapeHtml(game.awayScore)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(game.homeAbbr || game.homeTeam)}</span>
          <span style="font-weight:600">${escapeHtml(game.homeScore)}</span>
        </div>
      </div>
      <div style="flex-shrink:0;width:76px;text-align:right;font-size:10px;color:${stateColor(game.state)};${live ? 'font-weight:600' : ''}">${escapeHtml(game.statusDetail)}</div>
    </div>`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isToday(d: Date): boolean {
  return startOfDay(d).getTime() === startOfDay(new Date()).getTime();
}

function renderDateNav(selectedDate: Date): string {
  const label = selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:4px 8px 8px;font-size:12px">
      <button type="button" data-sports-nav="prev" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:2px 6px">‹</button>
      <span style="min-width:120px;text-align:center">${escapeHtml(label)}</span>
      <button type="button" data-sports-nav="next" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:2px 6px">›</button>
      ${isToday(selectedDate) ? '' : '<button type="button" data-sports-nav="today" style="background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--text-dim);cursor:pointer;font-size:10px;padding:2px 8px;margin-left:4px">Today</button>'}
    </div>`;
}

/** Shared base for the per-league score panels below — same pattern as
 *  MarketPanel.ts's multiple exported panel classes from one file, so
 *  vite.config.ts's PANEL_CLUSTER only needs a single "SportsLeague" entry. */
abstract class SportsLeaguePanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private selectedDate: Date = startOfDay(new Date());
  private readonly leagueKey: LeagueKey;

  constructor(id: string, title: string, leagueKey: LeagueKey) {
    super({ id, title, showCount: false, collapsible: true });
    this.leagueKey = leagueKey;
    this.content.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-sports-nav]');
      if (!target) return;
      const nav = target.dataset.sportsNav;
      if (nav === 'prev') this.changeDate(-1);
      else if (nav === 'next') this.changeDate(1);
      else if (nav === 'today') this.goToToday();
    });
    void this.fetchData();
    this.refreshTimer = setInterval(() => {
      if (isToday(this.selectedDate)) void this.fetchData();
    }, REFRESH_MS);
  }

  private changeDate(deltaDays: number): void {
    const next = new Date(this.selectedDate);
    next.setDate(next.getDate() + deltaDays);
    this.selectedDate = next;
    void this.fetchData();
  }

  private goToToday(): void {
    this.selectedDate = startOfDay(new Date());
    void this.fetchData();
  }

  public async fetchData(): Promise<boolean> {
    try {
      const nav = renderDateNav(this.selectedDate);

      if (!isLeagueInSeason(this.leagueKey, this.selectedDate)) {
        this.setSafeContent(unsafeRawHtml(
          `${nav}<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-dim)">Off-season</div>`,
          'sports league panel — off-season state',
        ));
        return true;
      }

      const games = await fetchSingleLeagueScores(this.leagueKey, this.signal, this.selectedDate);
      if (games.length === 0) {
        this.setSafeContent(unsafeRawHtml(
          `${nav}<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-dim)">No games on this day</div>`,
          'sports league panel — empty state',
        ));
        return true;
      }
      const html = nav + games.map(renderGame).join('');
      this.setSafeContent(unsafeRawHtml(html, 'sports league panel — trusted static markup, escaped team/score fields'));
      return true;
    } catch (e) {
      if (this.isAbortError(e)) return false;
      this.showError(e instanceof Error ? e.message : 'Failed to load scores', () => void this.fetchData());
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

export class NflScoresPanel extends SportsLeaguePanel {
  constructor() { super('sports-nfl', 'NFL Scores', 'nfl'); }
}

export class NbaScoresPanel extends SportsLeaguePanel {
  constructor() { super('sports-nba', 'NBA Scores', 'nba'); }
}

export class MlbScoresPanel extends SportsLeaguePanel {
  constructor() { super('sports-mlb', 'MLB Scores', 'mlb'); }
}

export class NhlScoresPanel extends SportsLeaguePanel {
  constructor() { super('sports-nhl', 'NHL Scores', 'nhl'); }
}

export class PremierLeagueScoresPanel extends SportsLeaguePanel {
  constructor() { super('sports-epl', 'Premier League Scores', 'epl'); }
}

export class MlsScoresPanel extends SportsLeaguePanel {
  constructor() { super('sports-mls', 'MLS Scores', 'mls'); }
}
