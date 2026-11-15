// Vercel Function for the master <-> astronaut relay: the same contract as src/engine/sync/relay.js (which the
// dev server uses), reached at /link through the rewrite in vercel.json.
//   POST /link            body = one link message { type, payload, from, sentAt, deliverAt }
//   GET  /link?after=<id> -> { messages: [{ id, age, m }] }
// Vercel functions keep no memory between requests, so messages live in Upstash Redis (Vercel Marketplace →
// Storage → Upstash for Redis, connected to this project). Without it, GET answers { configured: false } and the
// site stops polling; POST answers 503.
import { KEEP_MS, KEEP_N, MAX_BYTES, parseLinkMessage } from '../src/engine/sync/relay.js';

const LOG = 'marswalk:link:log', SEQ = 'marswalk:link:seq';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

// the Upstash integration sets one of these pairs, depending on how it was connected
const upstashEnv = () => ({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN,
});

const reply = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

/** Runs Redis commands through Upstash's REST pipeline; returns their results in order. */
async function redis(commands, { url, token }, fetchFn) {
  const r = await fetchFn(`${url}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(commands) });
  if (!r.ok) throw new Error(`redis HTTP ${r.status}`);
  const out = await r.json();
  for (const o of out) if (o.error) throw new Error(o.error);
  return out.map((o) => o.result);
}

export function createLinkHandler({ fetchFn = globalThis.fetch, now = () => Date.now(), env = upstashEnv } = {}) {
  return async function handle(request) {
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'GET' && request.method !== 'POST') return reply(405, { error: 'GET or POST' });
    const cfg = env();
    if (!cfg.url || !cfg.token) return request.method === 'GET' ? reply(200, { messages: [], configured: false }) : reply(503, { error: 'relay store not configured' });
    try {
      if (request.method === 'GET') {
        const after = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get('after')) || 0));
        const [rows] = await redis([['ZRANGE', LOG, `(${after}`, '+inf', 'BYSCORE']], cfg, fetchFn);
        const t = now();
        const messages = rows.map((r) => JSON.parse(r)).filter((e) => t - e.at <= KEEP_MS).map((e) => ({ id: e.id, age: t - e.at, m: e.m }));
        return reply(200, { messages });
      }
      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BYTES) return reply(413, { error: 'message too large' });
      let m;
      try { m = parseLinkMessage(text); } catch (e) { return reply(400, { error: e.message }); }
      const [id] = await redis([['INCR', SEQ]], cfg, fetchFn); // never expires: readers' "after" cursors stay valid
      await redis([
        ['ZADD', LOG, id, JSON.stringify({ id, at: now(), m })],
        ['ZREMRANGEBYRANK', LOG, 0, -(KEEP_N + 1)],
        ['EXPIRE', LOG, KEEP_MS / 1000],
      ], cfg, fetchFn);
      return reply(204);
    } catch {
      return reply(502, { error: 'relay store unavailable' });
    }
  };
}

const handle = createLinkHandler();
export const GET = handle, POST = handle, OPTIONS = handle;
