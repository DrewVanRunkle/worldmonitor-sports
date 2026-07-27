/**
 * Personal-use AI Sports Insights (VITE_ENABLE_SPORTS) — non-streaming,
 * NOT Pro-gated (unlike /api/chat-analyst).
 *
 * POST /api/sports-insights
 * Body: { games: { league, away, home, awayScore, homeScore, state, statusDetail }[] }
 *
 * Response (200): { text: string } | { text: null, reason: 'not_configured' }
 * 400 on invalid body, 503 on unexpected failure.
 *
 * Calls the app's existing generic LLM provider chain (server/_shared/llm.ts
 * — Ollama / OpenRouter / Groq / any custom OpenAI-compatible endpoint via
 * LLM_API_URL+LLM_API_KEY, e.g. a local LM Studio server). This route
 * deliberately skips Pro-gating: it only ever produces output when the
 * deployer has configured one of those providers, which is false by
 * default — that absence IS the gate for every deployment except this
 * user's own.
 */

export const config = { runtime: 'edge', regions: ['iad1', 'lhr1', 'fra1', 'sfo1'] };

// @ts-expect-error — JS module, no declaration file
import { getCorsHeaders } from './_cors.js';
// @ts-expect-error — JS module, no declaration file
import { captureSilentError } from './_sentry-edge.js';
import { checkRateLimit } from '../server/_shared/rate-limit';
import { callLlm, getProviderCredentials } from '../server/_shared/llm';
import { sanitizeForPrompt } from '../server/_shared/llm-sanitize.js';

const MAX_GAMES = 100;
const MAX_FIELD_CHARS = 80;

interface GameInput {
  league?: unknown;
  away?: unknown;
  home?: unknown;
  awayScore?: unknown;
  homeScore?: unknown;
  state?: unknown;
  statusDetail?: unknown;
}

interface RequestBody {
  games?: unknown;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function cleanField(value: unknown): string {
  if (typeof value !== 'string') return '';
  return sanitizeForPrompt(value.slice(0, MAX_FIELD_CHARS)) ?? '';
}

function hasAnyLlmProviderConfigured(): boolean {
  return (['ollama', 'openrouter', 'groq', 'generic'] as const).some(p => getProviderCredentials(p) !== null);
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req) as Record<string, string>;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    // Cheap, instant no-op for every deployment that hasn't configured an
    // LLM provider — no Redis/rate-limit dependency, no LLM call.
    if (!hasAnyLlmProviderConfigured()) {
      return json({ text: null, reason: 'not_configured' }, 200, corsHeaders);
    }

    const rateLimitResponse = await checkRateLimit(req, corsHeaders);
    if (rateLimitResponse) return rateLimitResponse;

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
    }

    const rawGames = Array.isArray(body.games) ? body.games.slice(0, MAX_GAMES) : [];
    const games = rawGames
      .filter((g): g is GameInput => !!g && typeof g === 'object')
      .map(g => ({
        league: cleanField(g.league),
        away: cleanField(g.away),
        home: cleanField(g.home),
        awayScore: cleanField(g.awayScore),
        homeScore: cleanField(g.homeScore),
        state: cleanField(g.state),
        statusDetail: cleanField(g.statusDetail),
      }))
      .filter(g => g.away && g.home);

    if (games.length === 0) {
      return json({ error: 'games is required and must contain at least one game' }, 400, corsHeaders);
    }

    const gameLines = games
      .map(g => `${g.league}: ${g.away} ${g.awayScore} @ ${g.home} ${g.homeScore} (${g.state === 'in' ? 'live' : (g.statusDetail || g.state)})`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content: "You are a concise sports desk assistant. Write a short, energetic recap of today's sports action using only the game data given. 3-4 sentences, plain prose, no markdown or bullet points, no invented details.",
      },
      { role: 'user', content: `Today's games:\n${gameLines}` },
    ];

    const result = await callLlm({
      messages,
      maxTokens: 220,
      temperature: 0.6,
      timeoutMs: 20_000,
      stage: 'sports-insights',
    });

    if (!result || !result.content.trim()) {
      return json({ text: null, reason: 'not_configured' }, 200, corsHeaders);
    }

    return json({ text: result.content.trim() }, 200, corsHeaders);
  } catch (err) {
    captureSilentError(err, { tags: { route: 'api/sports-insights', step: 'handler' } });
    return json({ error: 'service_unavailable' }, 503, corsHeaders);
  }
}
