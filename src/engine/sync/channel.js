// Master <-> astronaut messages over a same-browser BroadcastChannel, with simulated light-time delay.
// Real one-way light time Earth-Mars is 3 to 22 minutes; the demo default is 5 s.
// The SENDER stamps deliverAt and the RECEIVER waits, so a message still arrives if the sender closes.
// Message types: plan (master -> astronaut), ack, status, alert (astronaut -> master).
// With `relay` (a URL serving sync/relay.js) the same messages also cross devices, e.g. to the Marswalk AR phone app.
export const TYPES = ['plan', 'status', 'alert', 'ack'];
export const DEFAULT_DELAY_S = 5;
// poll fast only while the other side is talking (each poll is a function call on Vercel)
const POLL_MS = 1000, IDLE_POLL_MS = 5000, ACTIVE_FOR_MS = 30e3;
// the relay keeps 10 minutes of messages; on joining, skip what was already due long ago (old statuses)
const STALE_MS = 15e3;

export function createLink({ role, onMessage, name = 'marswalk-link', now = () => Date.now(), relay = null, fetchFn = globalThis.fetch, onRelay = () => {} }) {
  const ch = new BroadcastChannel(name), timers = new Set();
  let delayS = DEFAULT_DELAY_S, closed = false;
  // other tabs and devices are untrusted senders: accept only well-formed messages addressed to the other role
  const wellFormed = (m) => m && TYPES.includes(m.type) && m.from !== role && typeof m.deliverAt === 'number' && typeof m.sentAt === 'number';
  const deliver = (m, waitMs) => {
    const t = setTimeout(() => { timers.delete(t); onMessage(m); }, Math.max(0, Math.min(waitMs, 3600e3)));
    timers.add(t);
  };
  ch.onmessage = ({ data: m }) => { if (wellFormed(m)) deliver(m, m.deliverAt - now()); };

  if (relay) (async () => {
    let after = 0, online = null, heardAt = -Infinity;
    while (!closed) {
      try {
        const r = await fetchFn(`${relay}/link?after=${after}`);
        if (r.status === 404) { onRelay(false); return; } // no relay on this host (static deploy): stop asking
        if (!r.ok) throw new Error(`relay HTTP ${r.status}`);
        const body = await r.json();
        if (body.configured === false) { onRelay(false); return; } // Vercel without its Redis store
        for (const { id, age, m } of body.messages ?? []) {
          after = Math.max(after, id);
          if (closed || !wellFormed(m) || typeof age !== 'number') continue;
          // the sender's clock is not ours: time the delay from what is left of it after the relay held the message
          const wait = m.deliverAt - m.sentAt - age;
          if (wait < -STALE_MS) continue;
          heardAt = now();
          deliver(m, wait);
        }
        if (online !== true) onRelay((online = true));
      } catch {
        if (online !== false) onRelay((online = false));
      }
      await new Promise((r) => setTimeout(r, online && now() - heardAt < ACTIVE_FOR_MS ? POLL_MS : IDLE_POLL_MS));
    }
  })();

  return {
    get delayS() { return delayS; },
    setDelay(s) { delayS = Math.max(0, Math.min(Number(s) || 0, 1800)); },
    send(type, payload) {
      if (!TYPES.includes(type)) throw new Error(`unknown message type ${type}`);
      const sentAt = now(), m = { type, payload, from: role, sentAt, deliverAt: sentAt + delayS * 1000 };
      ch.postMessage(m);
      if (relay) fetchFn(`${relay}/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }).catch(() => {});
    },
    close() { closed = true; timers.forEach(clearTimeout); ch.close(); },
  };
}
