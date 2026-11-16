// Checks api/ar-comms.js against a fake Upstash REST pipeline.
// Exercises GET, POST, OPTIONS, validation, size limits, offline/unconfigured handling, and error states.
import assert from 'node:assert/strict';
import { createArCommsHandler } from './ar-comms.js';

function fakeUpstash(token) {
  const kv = new Map();
  const published = [];
  const calls = [];
  let shouldFail = false;

  const run = ([cmd, key, ...args]) => {
    if (cmd === 'SET') {
      const val = args[0];
      const ttl = args[1] === 'EX' ? Number(args[2]) : null;
      kv.set(key, { val, ttl });
      return 'OK';
    }
    if (cmd === 'GET') {
      const entry = kv.get(key);
      return entry ? entry.val : null;
    }
    if (cmd === 'PUBLISH') {
      published.push({ channel: key, message: args[0] });
      return 1;
    }
    throw new Error(`fake upstash: unhandled command ${cmd}`);
  };

  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    if (shouldFail) {
      return new Response(JSON.stringify([{ error: 'Upstash server simulated error 500' }]), { status: 500 });
    }
    assert.ok(url.endsWith('/pipeline'));
    assert.equal(init.headers.authorization, `Bearer ${token}`);
    const cmds = JSON.parse(init.body);
    const results = cmds.map((c) => ({ result: run(c) }));
    return new Response(JSON.stringify(results));
  };

  return {
    fetchFn,
    kv,
    published,
    calls,
    setShouldFail: (f) => {
      shouldFail = f;
    },
  };
}

let clock = 1_731_681_600_000;
const now = () => clock;
const env = { url: 'https://fake-ar-upstash.io', token: 'fake_ar_token_abc' };
const store = fakeUpstash(env.token);

const handle = createArCommsHandler({ fetchFn: store.fetchFn, now, env: () => env });
const get = () => handle(new Request('https://marswalk.example/ar-comms')).then((r) => r.json());
const post = (body, url = 'https://marswalk.example/ar-comms') =>
  handle(
    new Request(url, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

// 1. OPTIONS CORS preflight check
const optResp = await handle(new Request('https://marswalk.example/ar-comms', { method: 'OPTIONS' }));
assert.equal(optResp.status, 204);
assert.equal(optResp.headers.get('access-control-allow-origin'), '*');
assert.ok(optResp.headers.get('access-control-allow-methods').includes('GET'));
assert.ok(optResp.headers.get('access-control-allow-methods').includes('POST'));

// 2. Unsupported HTTP methods return 405
for (const method of ['DELETE', 'PUT', 'PATCH']) {
  const resp = await handle(new Request('https://marswalk.example/ar-comms', { method }));
  assert.equal(resp.status, 405);
  const data = await resp.json();
  assert.equal(data.error, 'GET or POST');
}

// 3. Unconfigured Upstash Redis credentials
const bare = createArCommsHandler({ fetchFn: store.fetchFn, now, env: () => ({}) });
const bareGet = await bare(new Request('https://marswalk.example/ar-comms'));
assert.equal(bareGet.status, 200);
assert.deepEqual(await bareGet.json(), { configured: false, data: null });

const barePost = await bare(new Request('https://marswalk.example/ar-comms', { method: 'POST', body: '{}' }));
assert.equal(barePost.status, 503);
assert.equal((await barePost.json()).error, 'store not configured');

// 4. GET before any telemetry is published
const initialGet = await get();
assert.equal(initialGet.configured, true);
assert.equal(initialGet.data, null);
assert.equal(initialGet.timestamp, clock);

// 5. POST body validation
// Empty body
assert.equal((await post('')).status, 400);
assert.equal((await post('   ')).status, 400);
// Malformed JSON
assert.equal((await post('{ not json')).status, 400);
// Non-object body (array, primitive)
assert.equal((await post('["not", "an", "object"]')).status, 400);
assert.equal((await post('"a string"')).status, 400);
assert.equal((await post('12345')).status, 400);
// Oversized payload (> 1MB)
const oversized = JSON.stringify({ big: 'x'.repeat(1024 * 1024 + 10) });
assert.equal((await post(oversized)).status, 413);

// 6. Valid POST and GET readback
const sampleArPayload = {
  timestamp: 1731681600,
  constellation: 'MRS',
  relays: [
    { id: 'l1', name: 'MRS-L1', altitude_km: 400, in_view: true },
    { id: 'l2', name: 'MRS-L2', altitude_km: 400, in_view: false },
  ],
  active_pass: {
    relay_id: 'l1',
    aos: 15.58,
    los: 15.73,
    max_elevation_deg: 48.2,
    track: [
      {
        time_s: 0,
        azimuth_deg: 22.1,
        elevation_deg: 12.4,
        uplink_margin_db: -0.8,
        atmos_loss_db: 1.4,
      },
    ],
  },
  link_budget: {
    downlink_margin_db: 3.8,
    uplink_margin_db: 1.5,
    atmos_loss_db: 0.5,
    delta_atmos_db: -0.5,
  },
};

const postResp = await post(sampleArPayload);
assert.equal(postResp.status, 200);
assert.deepEqual(await postResp.json(), { status: 'ok', set: true });

// Check Redis state
const stored = store.kv.get('marswalk:ar:comms');
assert.ok(stored);
assert.equal(stored.ttl, 3600); // default TTL
assert.deepEqual(JSON.parse(stored.val), sampleArPayload);
// Passes channel publish
assert.equal(store.published.length, 1);
assert.equal(store.published[0].channel, 'marswalk:comms:passes');

// Readback via GET
const readback = await get();
assert.equal(readback.configured, true);
assert.deepEqual(readback.data, sampleArPayload);
assert.equal(readback.timestamp, clock);

// 7. Custom TTL via query parameter
await post(sampleArPayload, 'https://marswalk.example/ar-comms?ttl=7200');
const stored7200 = store.kv.get('marswalk:ar:comms');
assert.equal(stored7200.ttl, 7200);

// 8. Custom TTL via body parameter
const sampleWithTtl = { ...sampleArPayload, ttl: 1800 };
await post(sampleWithTtl);
const stored1800 = store.kv.get('marswalk:ar:comms');
assert.equal(stored1800.ttl, 1800);

// 9. Upstash Redis outage / failure returns 502
store.setShouldFail(true);
const failGet = await handle(new Request('https://marswalk.example/ar-comms'));
assert.equal(failGet.status, 502);
assert.equal((await failGet.json()).error, 'relay store unavailable');

const failPost = await post(sampleArPayload);
assert.equal(failPost.status, 502);
assert.equal((await failPost.json()).error, 'relay store unavailable');

store.setShouldFail(false);

console.log('api/ar-comms: all tests passed');
