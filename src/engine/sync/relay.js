// Cross-device leg of the master <-> astronaut link: an in-memory mailbox the laptop browser and the phone app
// (Marswalk AR, Unity) both poll over plain HTTP, so no WebSocket library is needed on either side.
//   POST /link            body = one link message { type, payload, from, sentAt, deliverAt }
//   GET  /link?after=<id> -> { messages: [{ id, age, m }] }, age = ms the relay has held it
// Clocks on two devices disagree, so receivers time the light-time delay from (deliverAt - sentAt) - age,
// never from the sender's clock. Anyone on the network can post: receivers still validate every message.
// This in-memory relay serves the dev server; api/link.js is the same contract on Vercel, stored in Redis.
import { TYPES } from './channel.js';

export const KEEP_MS = 10 * 60e3, KEEP_N = 500;
export const MAX_BYTES = 1 << 20; // a plan carries the full AR package (~30 kB)

/** Parses one posted link message and keeps only its known fields; throws with a short reason. */
export function parseLinkMessage(text) {
  let m;
  try { m = JSON.parse(text); } catch { throw new Error('not JSON'); }
  if (!m || !TYPES.includes(m.type) || typeof m.from !== 'string' || typeof m.sentAt !== 'number' || typeof m.deliverAt !== 'number')
    throw new Error('not a link message');
  return { type: m.type, payload: m.payload, from: m.from, sentAt: m.sentAt, deliverAt: m.deliverAt };
}

export function createRelay({ now = () => Date.now() } = {}) {
  let next = 1;
  const log = [];
  /** Node http handler; returns false when the request is not for /link (so a dev server can fall through). */
  return function handle(req, res) {
    const url = new URL(req.url, 'http://relay');
    if (url.pathname !== '/link') return false;
    const reply = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
      res.end(body ? JSON.stringify(body) : undefined);
    };
    while (log.length && now() - log[0].at > KEEP_MS) log.shift();
    if (req.method === 'OPTIONS') return reply(204), true;
    if (req.method === 'GET') {
      const after = Number(url.searchParams.get('after')) || 0;
      reply(200, { messages: log.filter((e) => e.id > after).map((e) => ({ id: e.id, age: now() - e.at, m: e.m })) });
      return true;
    }
    if (req.method !== 'POST') return reply(405, { error: 'GET or POST' }), true;
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reply(413, { error: 'message too large' }); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BYTES) return;
      let m;
      try { m = parseLinkMessage(Buffer.concat(chunks).toString('utf8')); } catch (e) { return reply(400, { error: e.message }); }
      log.push({ id: next++, at: now(), m });
      if (log.length > KEEP_N) log.shift();
      reply(204);
    });
    return true;
  };
}
