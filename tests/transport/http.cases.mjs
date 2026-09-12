import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
const { NekonTransport, NEKON_API_VERSION } = await import(
  process.env.NEKON_TRANSPORT_TEST_MODULE ?? '@nekon/client-runtime/transport'
);

// Loopback only, ephemeral ports, synthetic data. No external service or credentials.
async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const options = { timeout: 5000 };

test('native HTTP round trip preserves version header and response metadata', options, async t => {
  const origin = await serve(t, (req, res) => {
    res.writeHead(201, { 'content-type': 'application/json', 'x-synthetic': 'yes' });
    res.end(JSON.stringify({ path: req.url, version: req.headers['nekon-api-version'] }));
  });
  const response = await new NekonTransport(origin).request('session');
  assert.equal(response.status, 201);
  assert.equal(response.url, `${origin}/api/client/v1/session`);
  assert.equal(response.headers.get('x-synthetic'), 'yes');
  assert.deepEqual(await response.json(), { path: '/api/client/v1/session', version: NEKON_API_VERSION });
});

test('native fetch does not follow a redirect to another loopback origin', options, async t => {
  let targetRequests = 0;
  const target = await serve(t, (_req, res) => { targetRequests++; res.end('unexpected'); });
  const origin = await serve(t, (_req, res) => { res.writeHead(302, { location: `${target}/sink` }); res.end(); });
  const client = new NekonTransport(origin);
  await assert.rejects(client.request('session', { redirect: 'follow' }), TypeError);
  await assert.rejects(client.discover(), TypeError);
  assert.equal(targetRequests, 0);
});

for (const consumer of ['text', 'reader', 'clone']) {
  test(`native chunked response enforces byte bound for ${consumer}`, options, async t => {
    const origin = await serve(t, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('abcdefgh');
      res.end('ijklmnop');
    });
    const response = await new NekonTransport(origin, { responseBodyLimitBytes: 3 }).request('session');
    if (consumer === 'reader') {
      await assert.rejects(response.body.getReader().read(), /response_body_too_large/);
    } else if (consumer === 'clone') {
      const clone = response.clone();
      await Promise.all([
        assert.rejects(response.text(), /response_body_too_large/),
        assert.rejects(clone.text(), /response_body_too_large/),
      ]);
    } else {
      await assert.rejects(response.text(), /response_body_too_large/);
    }
  });
}

test('native gzip decoding is bounded by decoded bytes, not small wire length', options, async t => {
  const compressed = gzipSync('x'.repeat(256));
  assert.ok(compressed.length < 32);
  const origin = await serve(t, (_req, res) => {
    res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': compressed.length });
    res.end(compressed);
  });
  const response = await new NekonTransport(origin, { responseBodyLimitBytes: 32 }).request('session');
  await assert.rejects(response.text(), /response_body_too_large/);
});

for (const operation of ['discovery', 'ticket']) {
  test(`native ${operation} failure closes a still-open server response`, options, async t => {
    let closed;
    const closeObserved = new Promise(resolve => { closed = resolve; });
    let path;
    const origin = await serve(t, (req, res) => {
      path = req.url;
      res.once('close', closed);
      res.writeHead(503);
      res.write('synthetic failure');
      // No end(): the client owns prompt cancellation of this rejected response.
    });
    const client = new NekonTransport(origin, { requestTimeoutMs: 0 });
    const result = operation === 'discovery' ? client.discover() : client.connect('dev_SYNTHETICDEVICE0000');
    await assert.rejects(result, /(?:nekon_discovery_failed|websocket_ticket_failed):503/);
    await closeObserved;
    assert.equal(path, operation === 'discovery' ? '/api/client/versions' : '/api/client/v1/auth/websocket-tickets');
  });
}

test('native caller cancellation after dispatch closes the pending request', options, async t => {
  const abort = new AbortController();
  const reason = new Error('synthetic caller cancellation');
  let closed;
  const closeObserved = new Promise(resolve => { closed = resolve; });
  const origin = await serve(t, (_req, res) => {
    res.once('close', closed);
    abort.abort(reason);
  });
  const client = new NekonTransport(origin, { requestTimeoutMs: 0 });
  await assert.rejects(client.request('session', { signal: abort.signal }), e => e === reason);
  await closeObserved;
});

test('native POST with no automatic retry preserves its one response and error body', options, async t => {
  let calls = 0;
  const origin = await serve(t, (req, res) => {
    calls++;
    assert.equal(req.method, 'POST');
    req.resume();
    res.writeHead(409);
    res.end('synthetic conflict');
  });
  const response = await new NekonTransport(origin).request('session', { method: 'POST', body: 'synthetic input' });
  assert.equal(response.status, 409);
  assert.equal(await response.text(), 'synthetic conflict');
  assert.equal(calls, 1);
});
