// Checks api/link.js (the Vercel relay) against a fake Upstash REST pipeline, and drives the real createLink
// client through it. The fake implements only the 5 Redis commands the function uses; real Upstash is not called.
import assert from 'node:assert/strict';
import { createLinkHandler } from './link.js';
import { createLink } from '../src/engine/sync/channel.js';

function fakeUpstash(token) {
  const kv = new Map(), zsets = new Map(), calls = [];
  const zset = (k) => zsets.get(k) ?? zsets.set(k, []).get(k);
  const run = ([cmd, key, ...a]) => {
    if (cmd === 'INCR') { const v = (kv.get(key) ?? 0) + 1; kv.set(key, v); return v; }
    if (cmd === 'ZADD') { const z = zset(key); z.push({ score: Number(a[0]), member: a[1] }); z.sort((x, y) => x.score - y.score); return 1; }
    if (cmd === 'ZRANGE' && a[2] === 'BYSCORE') { const min = Number(a[0].replace('(', '')); return zset(key).filter((e) => e.score > min).map((e) => e.member); }
    if (cmd === 'ZREMRANGEBYRANK') { const z = zset(key), keep = -Number(a[1]) - 1; const n = Math.max(0, z.length - keep); z.splice(0, n); return n; }
    if (cmd === 'EXPIRE') return 1;
    throw new Error(`fake upstash: ${cmd} not implemented`);
  };
  const fetchFn = async (url, init) => {
    assert.ok(url.endsWith('/pipeline') && init.headers.authorization === `Bearer ${token}`);
    calls.push(url);
    return new Response(JSON.stringify(JSON.parse(init.body).map((c) => ({ result: run(c) }))));
  };
  return { fetchFn, zsets, calls };
}

let clock = 1_000_000;
const now = () => clock;
const env = { url: 'https://fake.upstash.io', token: 't0k' };
const store = fakeUpstash(env.token);
const handle = createLinkHandler({ fetchFn: store.fetchFn, now, env: () => env });
const get = (after = 0) => handle(new Request(`https://tapak.example/link?after=${after}`)).then((r) => r.json());
const post = (body) => handle(new Request('https://tapak.example/link', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

// 1. Not connected to Redis yet: GET says so (the site then stops polling), POST refuses.
const bare = createLinkHandler({ fetchFn: store.fetchFn, now, env: () => ({}) });
assert.deepEqual(await (await bare(new Request('https://x/link'))).json(), { messages: [], configured: false });
assert.equal((await bare(new Request('https://x/link', { method: 'POST', body: '{}' }))).status, 503);

// 2. Store and read back, ages from the function's clock, cursors, refusals, size and count limits.
const phoneClock = clock + 600e3; // the phone's clock is 10 min off: never used for timing
assert.equal((await post({ type: 'status', payload: { t: 12, km: 0.4 }, from: 'astronaut', sentAt: phoneClock, deliverAt: phoneClock + 5000 })).status, 204);
for (const bad of ['{', { type: 'hack', from: 'x', sentAt: 1, deliverAt: 1 }, { type: 'plan', from: 'x' }]) assert.equal((await post(bad)).status, 400);
assert.equal((await post('x'.repeat((1 << 20) + 1))).status, 413);
clock += 1200;
let r = await get();
assert.equal(r.messages.length, 1);
assert.deepEqual([r.messages[0].id, r.messages[0].age, r.messages[0].m.payload.t], [1, 1200, 12]);
assert.equal((await get(1)).messages.length, 0, 'cursor skips what was already read');
for (let i = 0; i < 505; i++) await post({ type: 'status', payload: { i }, from: 'astronaut', sentAt: 0, deliverAt: 0 });
assert.equal(store.zsets.get('marswalk:link:log').length, 500, 'keeps the last 500');
clock += 11 * 60e3;
assert.equal((await get()).messages.length, 0, 'messages older than 10 min are not served');
assert.equal((await handle(new Request('https://x/link', { method: 'DELETE' }))).status, 405);

// 3. The real client through the function: the master hears a delayed status; a host without a store stops the polling.
const relay = 'https://tapak.example';
const routed = (h) => (url, init) => h(new Request(url, init));
const heard = [];
const live = createLinkHandler({ fetchFn: fakeUpstash(env.token).fetchFn, env: () => env });
const sent = Date.now();
await live(new Request(`${relay}/link`, { method: 'POST', body: JSON.stringify({ type: 'status', payload: { t: 3, km: 0.1 }, from: 'astronaut', sentAt: sent, deliverAt: sent + 300 }) }));
const master = createLink({ role: 'master', name: 'api-test', relay, fetchFn: routed(live), onMessage: (m) => heard.push(m) });
await new Promise((res) => setTimeout(res, 100));
assert.equal(heard.length, 0, 'held for what is left of the light-time delay');
await new Promise((res) => setTimeout(res, 600));
master.close();
assert.equal(heard.length, 1);
assert.equal(heard[0].payload.km, 0.1);

let polls = 0, relayState = null;
const counting = (url, init) => { polls++; return bare(new Request(url, init)); };
const idle = createLink({ role: 'master', name: 'api-test-2', relay, fetchFn: counting, onRelay: (on) => (relayState = on), onMessage: () => {} });
await new Promise((res) => setTimeout(res, 1200));
idle.close();
assert.deepEqual([polls, relayState], [1, false], 'without Redis the site asks once, then stops');

console.log(`api/link: Upstash-backed relay stores, serves, trims and ages messages; client stops after ${polls} poll where there is no store`);
console.log('api tests passed');
