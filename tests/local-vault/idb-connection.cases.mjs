/** Manual connection-event tests for the real adapter, NOT an IndexedDB engine.
 * The injected factory delivers named events and records calls. It does not
 * establish native persistence, transaction scheduling, rollback or browser policy.
 */
import assert from 'node:assert/strict';

const turn = () => new Promise(resolve => setImmediate(resolve));
const observe = promise => {
  const result = { state: 'pending', value: undefined, error: undefined };
  result.done = promise.then(value => { result.state = 'fulfilled'; result.value = value; },
    error => { result.state = 'rejected'; result.error = error; });
  return result;
};
function driver() {
  const requests = [];
  const faults = [];
  const factory = { open(name, version) {
    if (faults.length) throw faults.shift();
    const request = { name, version, result: undefined, error: null, transaction: null };
    requests.push(request);
    return request;
  } };
  const database = (label = 'current', stores = ['metadata', 'records']) => {
    const db = { label, closed: false, closes: 0, calls: [], created: [], pendingReads: [], autoRead: true,
      objectStoreNames: { contains: name => stores.includes(name) },
      createObjectStore(name) { db.created.push(name); },
      close() { db.closed = true; db.closes++; },
      transaction(scope, mode) {
        if (db.closed) throw new DOMException('synthetic closed connection', 'InvalidStateError');
        db.calls.push({ scope, mode });
        return { objectStore(store) { return { get(key) {
          const request = { result: { label, store, key } };
          db.pendingReads.push(request);
          if (db.autoRead) queueMicrotask(() => request.onsuccess?.({ target: request }));
          return request;
        } }; } };
      },
    };
    return db;
  };
  return { factory, requests, faults, database };
}
const succeed = (request, db) => { request.result = db; request.onsuccess?.({ target: request }); };
const fail = request => { request.error = new Error('synthetic raw provider detail'); request.onerror?.({ target: request }); };
const block = request => request.onblocked?.({ target: request });
const rejected = (result, code) => {
  assert.equal(result.state, 'rejected');
  assert.equal(result.error.message, code);
  assert.equal(result.error.cause, undefined);
};

export function registerIdbConnectionCases(test, { IndexedDbVaultStorage }) {
  const setup = () => {
    const d = driver();
    return { d, store: new IndexedDbVaultStorage('synthetic-connection-test', d.factory) };
  };
  const open = async (d, store, label = 'current') => {
    const read = observe(store.readHeader());
    const request = d.requests.at(-1); const db = d.database(label);
    succeed(request, db); await read.done;
    assert.equal(read.state, 'fulfilled'); return { request, db };
  };

  test('IDB connection events: concurrent operations share one pending open', async () => {
    const { d, store } = setup();
    const reads = [observe(store.readHeader()), observe(store.readRecord('sample:one')), observe(store.readHeader())];
    assert.equal(d.requests.length, 1);
    succeed(d.requests[0], d.database()); await Promise.all(reads.map(r => r.done));
    assert.ok(reads.every(r => r.state === 'fulfilled'));
  });
  test('IDB connection events: settled live connection remains cached', async () => {
    const { d, store } = setup(); const { db } = await open(d, store);
    await store.readRecord('sample:one'); await store.readHeader();
    assert.equal(d.requests.length, 1); assert.equal(db.calls.length, 3); assert.equal(db.closes, 0);
  });
  test('IDB connection events: database name and schema version remain fixed', async () => {
    const { d, store } = setup(); await open(d, store);
    assert.equal(d.requests[0].name, 'synthetic-connection-test'); assert.equal(d.requests[0].version, 1);
  });
  test('IDB connection events: terminal open error permits a later explicit retry', async () => {
    const { d, store } = setup(); const first = observe(store.readHeader());
    fail(d.requests[0]); await first.done; rejected(first, 'vault_storage_open_failed');
    assert.equal(d.requests.length, 1, 'failure must not start an automatic retry');
    const next = observe(store.readHeader()); await turn();
    assert.equal(d.requests.length, 2, 'rejected open must not poison the adapter forever');
    succeed(d.requests[1], d.database('retry')); await next.done;
    assert.equal(next.value.label, 'retry');
  });
  test('IDB connection events: synchronous factory errors are normalized and not cached forever', async () => {
    const { d, store } = setup(); d.faults.push(new DOMException('synthetic sensitive detail', 'SecurityError'));
    const first = observe(store.readHeader()); await first.done; rejected(first, 'vault_storage_open_failed');
    await open(d, store, 'after-throw'); assert.equal(d.requests.length, 1);
  });
  test('IDB connection events: concurrent failed waiters share one later retry', async () => {
    const { d, store } = setup();
    const first = [observe(store.readHeader()), observe(store.readRecord('sample:one'))];
    fail(d.requests[0]); await Promise.all(first.map(r => r.done));
    first.forEach(r => rejected(r, 'vault_storage_open_failed'));
    const next = [observe(store.readHeader()), observe(store.readRecord('sample:one'))]; await turn();
    assert.equal(d.requests.length, 2);
    succeed(d.requests[1], d.database('retry')); await Promise.all(next.map(r => r.done));
    assert.ok(next.every(r => r.state === 'fulfilled'));
  });
  test('IDB connection events: versionchange closes and evicts the cached handle', async () => {
    const { d, store } = setup(); const { db } = await open(d, store);
    db.onversionchange?.({ target: db }); assert.equal(db.closes, 1);
    assert.equal(d.requests.length, 1, 'closing must not automatically reopen');
    const next = observe(store.readHeader()); await turn(); assert.equal(d.requests.length, 2);
    succeed(d.requests[1], d.database('new')); await next.done; assert.equal(next.value.label, 'new');
  });
  test('IDB connection events: unexpected close allows a later explicit open', async () => {
    const { d, store } = setup(); const { db } = await open(d, store);
    db.closed = true; db.onclose?.({ target: db });
    assert.equal(d.requests.length, 1);
    const next = observe(store.readRecord('sample:one')); await turn(); assert.equal(d.requests.length, 2);
    succeed(d.requests[1], d.database('new')); await next.done; assert.equal(next.value.label, 'new');
  });
  test('IDB connection events: blocked open rejects all waiters with its existing code', async () => {
    const { d, store } = setup(); const reads = [observe(store.readHeader()), observe(store.readHeader())];
    block(d.requests[0]); await Promise.all(reads.map(r => r.done));
    reads.forEach(r => rejected(r, 'vault_storage_open_blocked'));
  });
  test('IDB connection events: a still-blocked request cannot accumulate additional open attempts', async () => {
    const { d, store } = setup(); const first = observe(store.readHeader());
    block(d.requests[0]); await first.done;
    for (let n = 0; n < 8; n++) { const r = observe(store.readHeader()); await r.done; rejected(r, 'vault_storage_open_blocked'); }
    assert.equal(d.requests.length, 1);
  });
  test('IDB connection events: late success after blocked rejection is closed, not published', async () => {
    const { d, store } = setup(); const first = observe(store.readHeader());
    block(d.requests[0]); await first.done; const late = d.database('abandoned');
    succeed(d.requests[0], late); await turn();
    assert.equal(late.closes, 1); assert.equal(late.calls.length, 0);
    rejected(first, 'vault_storage_open_blocked');
    const retry = observe(store.readHeader()); await turn(); assert.equal(d.requests.length, 2);
    succeed(d.requests[1], d.database('retry')); await retry.done; assert.equal(retry.value.label, 'retry');
  });
  test('IDB connection events: error after blocked rejection releases only the open slot', async () => {
    const { d, store } = setup(); const first = observe(store.readHeader());
    block(d.requests[0]); await first.done; fail(d.requests[0]); await turn();
    rejected(first, 'vault_storage_open_blocked');
    const retry = observe(store.readHeader()); await turn(); assert.equal(d.requests.length, 2);
    succeed(d.requests[1], d.database('retry')); await retry.done;
    assert.equal(retry.state, 'fulfilled');
  });
  test('IDB connection events: abandoned upgrade aborts before creating object stores', async () => {
    const { d, store } = setup(); const first = observe(store.readHeader());
    block(d.requests[0]); await first.done;
    const request = d.requests[0]; const db = d.database('abandoned-upgrade', []); let aborts = 0;
    request.result = db; request.transaction = { abort() { aborts++; } };
    request.onupgradeneeded?.({ target: request });
    assert.equal(aborts, 1); assert.deepEqual(db.created, []);
    fail(request); await turn(); rejected(first, 'vault_storage_open_blocked');
  });
  for (const stores of [[], ['metadata'], ['records'], ['metadata', 'records']]) {
    test(`IDB connection events: current upgrade creates only missing stores (${stores.join(',') || 'none'})`, async () => {
      const { d, store } = setup(); const read = observe(store.readHeader()); const req = d.requests[0];
      const db = d.database('upgrade', stores); req.result = db;
      req.transaction = { abort() { throw new Error('current upgrade must not be abandoned'); } };
      req.onupgradeneeded?.({ target: req });
      assert.deepEqual(db.created, ['metadata', 'records'].filter(name => !stores.includes(name)));
      assert.equal(read.state, 'pending'); succeed(req, db); await read.done;
      assert.equal(read.state, 'fulfilled');
    });
  }
  for (const event of ['onversionchange', 'onclose']) {
    test(`IDB connection events: stale ${event} cannot evict a newer connection`, async () => {
      const { d, store } = setup(); const { db: old } = await open(d, store, 'old');
      const stale = () => old[event]?.({ target: old });
      old.onversionchange?.({ target: old });
      const read = observe(store.readHeader()); await turn(); assert.equal(d.requests.length, 2);
      const current = d.database('new'); succeed(d.requests[1], current); await read.done;
      stale();
      assert.equal((await store.readHeader()).label, 'new'); assert.equal(d.requests.length, 2); assert.equal(current.closes, 0);
    });
  }
  test('IDB connection events: closing never replays an already dispatched read', async () => {
    const { d, store } = setup(); const { db } = await open(d, store);
    db.autoRead = false;
    const pending = observe(store.readRecord('sample:one')); await turn();
    db.closed = true; db.onclose?.({ target: db });
    const req = db.pendingReads.at(-1); req.onerror?.({ target: req });
    await pending.done; rejected(pending, 'vault_storage_read_failed');
    assert.equal(d.requests.length, 1); assert.equal(db.calls.length, 2);
  });
  test('IDB connection events: unsupported-version open errors do not change the requested version', async () => {
    const { d, store } = setup(); const first = observe(store.readHeader());
    fail(d.requests[0]); await first.done;
    const retry = observe(store.readHeader()); await turn(); assert.equal(d.requests.length, 2);
    assert.ok(d.requests.every(r => r.version === 1));
    fail(d.requests[1]); await retry.done; rejected(retry, 'vault_storage_open_failed');
  });
}
