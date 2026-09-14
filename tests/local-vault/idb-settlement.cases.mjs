/** Event-delivery unit tests, NOT an IndexedDB implementation or browser gate.
 * These drive the real adapter's callbacks explicitly. They make no claim about
 * persistence, rollback, transaction scheduling, or native cross-tab behavior.
 */
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const clone = value => structuredClone(value);
const turn = () => new Promise(resolve => setImmediate(resolve));
const header = () => ({
  formatVersion: 1, vaultId: 'vault_' + 'A'.repeat(22), headerRevision: 1,
  kdf: { id: 'argon2id-v1', memoryKiB: 65536, iterations: 3, parallelism: 1, salt: new Uint8Array(16) },
  wrappingCipher: 'AES-256-GCM', wrapNonce: new Uint8Array(12), wrappedDataKey: new Uint8Array(48),
  createdAt: 1000, updatedAt: 1000,
});
const record = (id = 'sample:one') => ({
  formatVersion: 1, vaultId: header().vaultId, recordId: id, kind: 'enterprise_provisioning',
  revision: 1, deleted: false, nonce: new Uint8Array(12), ciphertext: new Uint8Array(17), updatedAt: 1000,
});

/** Intentionally manual. No storage engine, automatic commit or fake browser. */
function eventDriver() {
  const transactions = [];
  let notify;
  const available = new Promise(resolve => { notify = resolve; });
  const database = {
    transaction(stores, mode) {
      const tx = {
        stores, mode, requests: [], writes: [], error: null,
        objectStore(name) {
          const request = (kind, value, key) => {
            const req = { kind, store: name, value, key, result: undefined, error: null };
            tx.requests.push(req);
            if (kind !== 'get') tx.writes.push(req);
            return req;
          };
          return {
            get: key => request('get', undefined, key),
            add: (value, key) => request('add', clone(value), key),
            put: (value, key) => request('put', clone(value), key),
            clear: () => request('clear'),
          };
        },
        abort() { queueMicrotask(() => tx.onabort?.({ target: tx })); },
      };
      transactions.push(tx); notify(tx); return tx;
    },
    close() {},
  };
  const factory = { open() {
    const request = { result: database };
    queueMicrotask(() => request.onsuccess?.({ target: request }));
    return request;
  } };
  return { factory, transactions, next: () => available };
}
function observe(promise) {
  const state = { status: 'pending', value: undefined, error: undefined };
  state.done = promise.then(
    value => { state.status = 'fulfilled'; state.value = value; },
    error => { state.status = 'rejected'; state.error = error; },
  );
  return state;
}
function success(request, value) {
  request.result = clone(value);
  request.onsuccess?.({ target: request });
}
function failed(request) {
  request.error = new Error('synthetic raw error must not escape');
  request.onerror?.({ target: request });
}
function prepare(tx, h = header(), existing = undefined) {
  // Process get callbacks synchronously as event handlers. Some enqueue another
  // request. Do not commit: an individual request's success is not commit proof.
  for (let i = 0; i < tx.requests.length; i++) {
    const req = tx.requests[i];
    if (req.kind === 'get') success(req, req.store === 'metadata' ? h : existing);
    else success(req, undefined);
  }
}
const operations = {
  createHeader: store => store.createHeader(header()),
  replaceHeader: store => store.replaceHeader({ ...header(), headerRevision: 2 }, 1),
  compareAndSwapRecord: store => store.compareAndSwapRecord(record(), 0),
  compareAndSwapRecords: store => store.compareAndSwapRecords([
    { record: record('sample:one'), expectedRevision: 0 },
    { record: record('sample:two'), expectedRevision: 0 },
  ]),
  clear: store => store.clear(),
};
const failureCode = name => name === 'clear' ? 'vault_storage_clear_failed' : 'vault_storage_write_failed';

export function registerIdbSettlementCases(test, { IndexedDbVaultStorage, LocalSecretVault }) {
  for (const [name, run] of Object.entries(operations)) {
    test(`IDB event driver: ${name} rejects abort-only completion`, async () => {
      const driver = eventDriver(); const store = new IndexedDbVaultStorage('synthetic-events', driver.factory);
      const result = observe(run(store)); const tx = await driver.next(); prepare(tx);
      await turn(); assert.equal(result.status, 'pending');
      // All requests have succeeded, then the transaction aborts. No request
      // error or transaction error event is emitted in this injected schedule.
      tx.onabort?.({ target: tx }); await turn();
      assert.equal(result.status, 'rejected', `${name} must settle after abort without requiring an error event`);
      assert.equal(result.error.message, failureCode(name));
      assert.equal(result.error.cause, undefined);
    });
    test(`IDB event driver: ${name} waits for transaction complete after request success`, async () => {
      const driver = eventDriver(); const store = new IndexedDbVaultStorage('synthetic-events', driver.factory);
      const result = observe(run(store)); const tx = await driver.next(); prepare(tx);
      await turn(); assert.equal(result.status, 'pending');
      tx.oncomplete?.({ target: tx }); await result.done;
      assert.equal(result.status, 'fulfilled');
    });
    test(`IDB event driver: ${name} retains error mapping when error precedes abort`, async () => {
      const driver = eventDriver(); const store = new IndexedDbVaultStorage('synthetic-events', driver.factory);
      const result = observe(run(store)); const tx = await driver.next(); prepare(tx);
      tx.onerror?.({ target: tx }); tx.onabort?.({ target: tx }); await result.done;
      assert.equal(result.status, 'rejected'); assert.equal(result.error.message, failureCode(name));
    });
  }
  for (const [name, supplied, existing, expected] of [
    ['replaceHeader', { ...header(), headerRevision: 2 }, undefined, 'vault_header_revision_conflict'],
    ['replaceHeader', null, undefined, 'vault_header_revision_conflict'],
    ['compareAndSwapRecord', { ...header(), vaultId: 'vault_' + 'B'.repeat(22) }, undefined, 'vault_header_revision_conflict'],
    ['compareAndSwapRecord', header(), record(), 'vault_record_revision_conflict'],
    ['compareAndSwapRecord', header(), { invalid: true }, 'vault_record_corrupt'],
    ['compareAndSwapRecords', null, undefined, 'vault_header_revision_conflict'],
    ['compareAndSwapRecords', header(), record(), 'vault_record_revision_conflict'],
  ]) {
    test(`IDB event driver: ${name} preserves ${expected} after its own abort`, async () => {
      const driver = eventDriver(); const store = new IndexedDbVaultStorage('synthetic-events', driver.factory);
      const result = observe(operations[name](store)); const tx = await driver.next(); prepare(tx, supplied, existing);
      await turn(); assert.equal(result.status, 'rejected'); assert.equal(result.error.message, expected);
      assert.equal(tx.writes.length, 0, 'conflicts must not enqueue a write');
    });
  }
  for (const name of ['createHeader', 'replaceHeader', 'compareAndSwapRecord', 'compareAndSwapRecords']) {
    test(`IDB event driver: ${name} preserves request error before abort`, async () => {
      const driver = eventDriver(); const store = new IndexedDbVaultStorage('synthetic-events', driver.factory);
      const result = observe(operations[name](store)); const tx = await driver.next();
      failed(tx.requests[0]); tx.abort(); await turn();
      assert.equal(result.status, 'rejected');
      assert.equal(result.error.message, name === 'createHeader' ? 'vault_already_initialized' : 'vault_storage_read_failed');
    });
  }
  for (const operation of ['write', 'rewrap']) {
    test(`IDB event driver: abort releases the actual vault ${operation} lease so lockAndDrain settles`, async () => {
      // Native AES-GCM, fast TEST-ONLY derivation and manual transaction events.
      // Header persistence here is memory, NOT IndexedDB persistence.
      const driver = eventDriver(); const adapter = new IndexedDbVaultStorage('synthetic-events', driver.factory);
      let saved;
      const storage = {
        readHeader: async () => clone(saved),
        createHeader: async value => { saved = clone(value); },
        replaceHeader: (...args) => adapter.replaceHeader(...args),
        compareAndSwapRecord: (...args) => adapter.compareAndSwapRecord(...args),
      };
      const vault = new LocalSecretVault({ storage, crypto: webcrypto, inactivityLockMs: null,
        deriveKey: async (secret, salt) => {
          const bytes = new Uint8Array(secret.length + salt.length); bytes.set(secret); bytes.set(salt, secret.length);
          try { return new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)); }
          finally { bytes.fill(0); }
        },
      });
      await vault.create('synthetic-test-secret');
      const pending = observe(operation === 'write'
        ? vault.write({ recordId: 'sample:one', kind: 'enterprise_provisioning', expectedRevision: 0, plaintext: new Uint8Array([7]) })
        : vault.changeUnlockSecret('synthetic-test-secret', 'synthetic-next-secret'));
      const tx = await driver.next(); prepare(tx, saved);
      const drain = observe(vault.lockAndDrain()); await turn(); assert.equal(drain.status, 'pending');
      tx.onabort?.({ target: tx }); await turn();
      assert.equal(pending.status, 'rejected');
      assert.equal(pending.error.message, operation === 'write' ? 'vault_storage_write_failed' : 'vault_rewrap_failed');
      assert.equal(drain.status, 'fulfilled', 'aborted adapter work must release the vault operation lease');
      assert.equal(vault.state, 'locked');
    });
  }
}
