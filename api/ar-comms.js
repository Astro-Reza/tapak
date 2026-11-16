// Vercel Function for AR device telemetry streaming via Upstash Redis.
// Exposes GET, POST, and OPTIONS at /ar-comms through the rewrite in vercel.json.
//   GET  /ar-comms        -> { configured: bool, data: object | null, timestamp: number }
//   POST /ar-comms        body = AR comms telemetry JSON matching PROJECT.md schema
//                         -> { status: "ok", set: true } (or 204)
// If Upstash Redis is unconfigured: GET answers { configured: false, data: null }, POST answers 503.

const AR_KEY = 'marswalk:ar:comms';
const PASSES_CHANNEL = 'marswalk:comms:passes';
const MAX_BYTES = 1024 * 1024; // 1 MB payload limit
const DEFAULT_TTL_S = 3600;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

// The Upstash integration sets one of these pairs
const upstashEnv = () => ({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN,
});

const reply = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...CORS,
    },
  });

/** Runs Redis commands through Upstash's REST pipeline; returns their results in order. */
async function redis(commands, { url, token }, fetchFn) {
  const r = await fetchFn(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis HTTP ${r.status}`);
  const out = await r.json();
  for (const o of out) if (o.error) throw new Error(o.error);
  return out.map((o) => o.result);
}

export function createArCommsHandler({
  fetchFn = globalThis.fetch,
  now = () => Date.now(),
  env = upstashEnv,
} = {}) {
  return async function handle(request) {
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'GET' && request.method !== 'POST') {
      return reply(405, { error: 'GET or POST' });
    }

    const cfg = env();
    if (!cfg.url || !cfg.token) {
      return request.method === 'GET'
        ? reply(200, { configured: false, data: null })
        : reply(503, { error: 'store not configured' });
    }

    try {
      if (request.method === 'GET') {
        const [val] = await redis([['GET', AR_KEY]], cfg, fetchFn);
        let data = null;
        if (val) {
          try {
            data = typeof val === 'string' ? JSON.parse(val) : val;
          } catch {
            data = val;
          }
        }
        return reply(200, { configured: true, data, timestamp: now() });
      }

      // POST /ar-comms
      const text = await request.text();
      if (!text || !text.trim()) {
        return reply(400, { error: 'empty body' });
      }
      if (Buffer.byteLength(text) > MAX_BYTES) {
        return reply(413, { error: 'payload too large' });
      }

      let body;
      try {
        body = JSON.parse(text);
      } catch (e) {
        return reply(400, { error: `invalid json: ${e.message}` });
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply(400, { error: 'body must be a json object' });
      }

      let ttl = DEFAULT_TTL_S;
      try {
        const url = new URL(request.url);
        const ttlParam = url.searchParams.get('ttl');
        if (ttlParam) ttl = Number(ttlParam) || DEFAULT_TTL_S;
        else if (typeof body.ttl === 'number') ttl = body.ttl;
      } catch {
        if (typeof body.ttl === 'number') ttl = body.ttl;
      }

      const commands = [
        ['SET', AR_KEY, typeof text === 'string' ? text : JSON.stringify(body), 'EX', Math.max(1, Math.floor(ttl))],
      ];
      if (body.passes || body.active_pass || body.activePass) {
        commands.push(['PUBLISH', PASSES_CHANNEL, typeof text === 'string' ? text : JSON.stringify(body)]);
      }

      await redis(commands, cfg, fetchFn);
      return reply(200, { status: 'ok', set: true });
    } catch {
      return reply(502, { error: 'relay store unavailable' });
    }
  };
}

const handle = createArCommsHandler();
export const GET = handle, POST = handle, OPTIONS = handle;
