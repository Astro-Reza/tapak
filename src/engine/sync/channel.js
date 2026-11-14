// Master <-> astronaut messages over a same-browser BroadcastChannel, with simulated light-time delay.
// Real one-way light time Earth-Mars is 3 to 22 minutes; the demo default is 5 s.
// The SENDER stamps deliverAt and the RECEIVER waits, so a message still arrives if the sender closes.
// Message types: plan (master -> astronaut), ack, status, alert (astronaut -> master).
export const TYPES = ['plan', 'status', 'alert', 'ack'];
export const DEFAULT_DELAY_S = 5;

export function createLink({ role, onMessage, name = 'marswalk-link', now = () => Date.now() }) {
  const ch = new BroadcastChannel(name), timers = new Set();
  let delayS = DEFAULT_DELAY_S;
  ch.onmessage = ({ data: m }) => {
    // other tabs are untrusted senders: accept only well-formed messages addressed to the other role
    if (!m || !TYPES.includes(m.type) || m.from === role || typeof m.deliverAt !== 'number') return;
    const wait = Math.max(0, Math.min(m.deliverAt - now(), 3600e3));
    const t = setTimeout(() => { timers.delete(t); onMessage(m); }, wait);
    timers.add(t);
  };
  return {
    get delayS() { return delayS; },
    setDelay(s) { delayS = Math.max(0, Math.min(Number(s) || 0, 1800)); },
    send(type, payload) {
      if (!TYPES.includes(type)) throw new Error(`unknown message type ${type}`);
      const sentAt = now();
      ch.postMessage({ type, payload, from: role, sentAt, deliverAt: sentAt + delayS * 1000 });
    },
    close() { timers.forEach(clearTimeout); ch.close(); },
  };
}
