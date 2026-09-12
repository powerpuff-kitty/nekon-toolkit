import test from 'node:test';
import assert from 'node:assert/strict';

const { NekonTransport } = await import(
  process.env.NEKON_TRANSPORT_TEST_MODULE ?? '@nekon/client-runtime/transport'
);
const DEVICE = 'dev_SYNTHETICDEVICE0000';
const ROOM = 'room_SYNTHETICROOM00000';
const CALL = 'call_SYNTHETICCALL00000';
const ORIGIN = 'https://example.invalid';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Only synthetic responses; no credentials, network, or real Room content.
function bodyFixture(cancelMode = 'resolve') {
  const state = { canceled: 0, pulls: 0, reason: undefined };
  const body = new ReadableStream({
    pull() { state.pulls++; },
    cancel(reason) {
      state.canceled++;
      state.reason = reason;
      if (cancelMode === 'reject') return Promise.reject(new Error('synthetic cancel rejection'));
      if (cancelMode === 'pending') return new Promise(() => {});
    },
  }, { highWaterMark: 0 });
  return { body, state };
}
function setup(fetch, requestTimeoutMs = 0) {
  const sockets = [];
  class Socket { constructor(...args) { sockets.push(args); } }
  const transport = new NekonTransport(ORIGIN, { fetch, WebSocket: Socket, requestTimeoutMs });
  return { transport, sockets };
}
const operations = [
  ['discover', t => t.discover(), /nekon_discovery_failed:503/],
  ['connect', t => t.connect(DEVICE), /websocket_ticket_failed:503/],
  ['connectRoomLive', t => t.connectRoomLive(ROOM, DEVICE), /websocket_ticket_failed:503/],
  ['connectCall', t => t.connectCall(CALL, DEVICE), /websocket_ticket_failed:503/],
];
for (const [name, operation, error] of operations) {
  for (const timeout of [0, 10]) {
    test(`${name}: rejected status disposes unread body with timeout ${timeout}`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const { body, state } = bodyFixture();
      let requestSignal;
      const { transport, sockets } = setup(async (_url, init) => {
        requestSignal = init.signal;
        return new Response(body, { status: 503 });
      }, timeout);
      await assert.rejects(operation(transport), error);
      await flush();
      try {
        assert.equal(state.canceled, 1, 'rejected owned response must be canceled immediately');
        assert.equal(state.pulls, 0, 'must not drain the rejected body');
        assert.equal(body.locked, false, 'cancellation releases the owned reader');
        t.mock.timers.tick(100);
        assert.notEqual(requestSignal?.aborted, true, 'disposed response leaves no deadline timer');
        assert.equal(sockets.length, 0);
      } finally { t.mock.timers.tick(100); }
    });
  }
}
for (const cancelMode of ['reject', 'pending']) {
  for (const [name, operation, error] of operations) {
    test(`${name}: ${cancelMode} cancellation cannot replace or stall the status error`, async () => {
      const { body, state } = bodyFixture(cancelMode);
      const { transport } = setup(async () => new Response(body, { status: 503 }));
      await assert.rejects(operation(transport), error);
      await flush();
      assert.equal(state.canceled, 1);
      assert.equal(state.pulls, 0);
    });
  }
}
for (const method of ['GET', 'POST']) {
  for (const timeout of [0, 10]) {
    test(`${method}: pre-aborted signal never dispatches with timeout ${timeout}`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const abort = new AbortController();
      const reason = new Error('synthetic pre-abort');
      abort.abort(reason);
      let calls = 0;
      const { transport } = setup(async () => { calls++; return new Response(null, { status: 204 }); }, timeout);
      await assert.rejects(transport.request('session', { method, signal: abort.signal }), e => e === reason);
      assert.equal(calls, 0);
      t.mock.timers.tick(100);
    });
  }
}
for (const method of ['GET', 'POST']) {
  for (const timeout of [0, 10]) {
    for (const withBody of [false, true]) {
      test(`${method}: abort during headers rejects late ${withBody ? 'body' : 'empty'} response with timeout ${timeout}`, async t => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const abort = new AbortController();
        const reason = new Error('synthetic in-flight abort');
        const { body, state } = bodyFixture();
        const { transport } = setup(async () => {
          abort.abort(reason);
          return new Response(withBody ? body : null, { status: withBody ? 200 : 204 });
        }, timeout);
        await assert.rejects(transport.request('session', { method, signal: abort.signal }), e => e === reason);
        await flush();
        assert.equal(state.canceled, withBody ? 1 : 0);
        t.mock.timers.tick(100);
      });
    }
  }
}
test('expired read cannot return success from an adapter that delivers empty headers late', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finishFetch;
  const { transport } = setup(() => new Promise(resolve => { finishFetch = resolve; }), 10);
  const result = transport.request('session');
  const rejected = assert.rejects(result, { name: 'TimeoutError' });
  t.mock.timers.tick(10);
  finishFetch(new Response(null, { status: 204 }));
  await rejected;
});
test('generic request retains ownership of an HTTP error body for its caller', async () => {
  const { body, state } = bodyFixture();
  const { transport } = setup(async () => new Response(body, { status: 409 }));
  const response = await transport.request('session');
  assert.equal(response.status, 409);
  assert.equal(state.canceled, 0);
  await response.body.cancel();
  await flush();
  assert.equal(state.canceled, 1);
});
test('generic request preserves error body text for application diagnostics', async () => {
  const { transport } = setup(async () => new Response('synthetic conflict', { status: 409 }));
  const response = await transport.request('session');
  assert.equal(response.status, 409);
  assert.equal(await response.text(), 'synthetic conflict');
});
test('successful discovery consumes the body and clears its timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const { transport } = setup(async (_url, init) => { signal = init.signal; return Response.json({ synthetic: true }); }, 10);
  assert.deepEqual(await transport.discover(), { synthetic: true });
  t.mock.timers.tick(100);
  assert.equal(signal.aborted, false);
});
test('write without an explicit deadline keeps its original signal and is never retried', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const abort = new AbortController();
  let signal;
  let calls = 0;
  let finishFetch;
  const { transport } = setup((_url, init) => {
    calls++; signal = init.signal;
    return new Promise(resolve => { finishFetch = resolve; });
  }, 10);
  const result = transport.request('session', { method: 'POST', signal: abort.signal });
  t.mock.timers.tick(100);
  assert.equal(signal, abort.signal);
  assert.equal(signal.aborted, false);
  finishFetch(new Response(null, { status: 204 }));
  assert.equal((await result).status, 204);
  assert.equal(calls, 1);
});
