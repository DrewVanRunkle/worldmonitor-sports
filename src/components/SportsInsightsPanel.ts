import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { toApiUrl } from '@/services/runtime';
import { fetchAllSportsScores } from '@/services/sports-scores';

const REFRESH_MS = 10 * 60_000;

interface InsightsResponse {
  text: string | null;
  reason?: string;
}

export class SportsInsightsPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'sports-insights', title: 'AI Sports Insights', showCount: false, collapsible: true });
    void this.fetchData();
    this.refreshTimer = setInterval(() => void this.fetchData(), REFRESH_MS);
  }

  public async fetchData(): Promise<boolean> {
    try {
      const boards = await fetchAllSportsScores(this.signal);
      const games = boards.flatMap(board => board.games.map(game => ({
        league: board.leagueLabel,
        away: game.awayTeam,
        home: game.homeTeam,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        state: game.state,
        statusDetail: game.statusDetail,
      })));

      if (games.length === 0) {
        this.setSafeContent(unsafeRawHtml(
          '<div style="text-align:center;padding:16px;font-size:12px;color:var(--text-dim)">No games today to summarize</div>',
          'sports insights panel — empty state',
        ));
        return true;
      }

      const resp = await fetch(toApiUrl('/api/sports-insights'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games }),
        signal: this.signal,
      });
      if (!resp.ok) throw new Error(`AI sports insights: ${resp.status}`);
      const data = await resp.json() as InsightsResponse;

      if (!data.text) {
        this.setSafeContent(unsafeRawHtml(
          '<div style="padding:16px;font-size:12px;color:var(--text-dim);text-align:center">Configure an LLM provider (LLM_API_URL / LLM_API_KEY, or Ollama) on the server to enable AI recaps.</div>',
          'sports insights panel — not-configured state',
        ));
        return true;
      }

      this.setSafeContent(unsafeRawHtml(
        `<div style="padding:12px 14px;font-size:13px;line-height:1.5;color:var(--text);white-space:pre-line">${escapeHtml(data.text)}</div>`,
        'sports insights panel — escaped LLM text',
      ));
      return true;
    } catch (e) {
      if (this.isAbortError(e)) return false;
      this.showError(e instanceof Error ? e.message : 'Failed to load AI insights', () => void this.fetchData());
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
