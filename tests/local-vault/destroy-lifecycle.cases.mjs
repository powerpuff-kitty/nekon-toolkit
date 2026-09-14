/** Actual vault + native AES-GCM, with controlled in-memory storage and a fast
 * TEST-ONLY derivation. These are lifecycle tests, not native IndexedDB evidence.
 */
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';

const SECRET = 'synthetic-destruction-test-only';
const KIND = 'enterprise_provisioning';
const bytes = value => new TextEncoder().encode(value);
const clone = value => structuredClone(value);
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function observe(promise) {
  const result = { status: 'pending', error: undefined };
  result.done = promise.then(() => { result.status = 'fulfilled'; },
    error => { result.status = 'rejected'; result.error = error; });
  return result;
}
async function fixture(LocalSecretVault) {
  let header = null;
  const records = new Map();
  const counts = { clears: 0, derivations: 0, writes: 0 };
  const hooks = {};
  const storage = {
    readHeader: async () => clone(header),
    async createHeader(value) {
      await hooks.beforeCreate?.();
      if (header !== null) throw new Error('vault_already_initialized');
      header = clone(value);
    },
    async readRecord(id) { await hooks.beforeRead?.(); return clone(records.get(id) ?? null); },
    async compareAndSwapRecord(record, expectedRevision) {
      await hooks.beforeWrite?.();
      if (header?.vaultId !== record.vaultId) throw new Error('vault_header_revision_conflict');
      if ((records.get(record.recordId)?.revision ?? 0) !== expectedRevision) throw new Error('vault_record_revision_conflict');
      records.set(record.recordId, clone(record)); counts.writes++;
    },
    async clear() {
      counts.clears++;
      await hooks.beforeClear?.();
      header = null; records.clear();
      await hooks.afterClear?.();
    },
  };
  const make = () => new LocalSecretVault({ storage, crypto: webcrypto, inactivityLockMs: null,
    deriveKey(secret, salt) {
      counts.derivations++;
      // Intentionally not a password KDF. No new runtime derivation is supplied.
      return Uint8Array.from(createHash('sha256').update(secret).update(salt).digest());
    },
  });
  const vault = make(); await vault.create(SECRET);
  const write = () => vault.write({ recordId: 'sample:one', kind: KIND, expectedRevision: 0, plaintext: bytes('synthetic record') });
  return { vault, make, write, storage, hooks, records, counts, header: () => clone(header) };
}

export function registerDestroyLifecycleCases(test, { LocalSecretVault }) {
  for (const phase of ['drain', 'clear']) {
    for (const operation of ['unlock', 'create']) {
      test(`vault destruction: rejects ${operation} during ${phase} before derivation`, async () => {
        const f = await fixture(LocalSecretVault);
        const entered = deferred(), release = deferred();
        let pendingRead;
        if (phase === 'drain') {
          f.hooks.beforeRead = async () => { entered.resolve(); await release.promise; };
          pendingRead = observe(f.vault.read('sample:one', KIND)); await entered.promise;
        } else {
          f.hooks.beforeClear = async () => { entered.resolve(); await release.promise; };
        }
        const destruction = observe(f.vault.destroy());
        if (phase === 'clear') await entered.promise;
        try {
          assert.equal(f.vault.state, 'locked');
          await assert.rejects(f.vault[operation](SECRET), /vault_locked/);
          assert.equal(f.counts.derivations, 1, 'teardown must not start a replacement key session');
          assert.equal(destruction.status, 'pending');
        } finally { release.resolve(); await destruction.done; await pendingRead?.done; }
        assert.equal(destruction.status, 'fulfilled'); assert.equal(f.vault.state, 'destroyed');
      });
    }
  }
  for (const fail of [false, true]) {
    test(`vault destruction: concurrent callers share one clear and ${fail ? 'failure' : 'success'}`, async () => {
      const f = await fixture(LocalSecretVault); const entered = deferred(), release = deferred();
      const cause = new Error('synthetic clear failure');
      f.hooks.beforeClear = async () => { entered.resolve(); await release.promise; if (fail) throw cause; };
      const first = observe(f.vault.destroy()); await entered.promise;
      const others = Array.from({ length: 4 }, () => observe(f.vault.destroy()));
      try { await turn(); assert.equal(f.counts.clears, 1); }
      finally { release.resolve(); await Promise.all([first, ...others].map(r => r.done)); }
      assert.ok([first, ...others].every(r => r.status === (fail ? 'rejected' : 'fulfilled')));
      if (fail) assert.ok([first, ...others].every(r => r.error === cause));
      assert.equal(f.vault.state, fail ? 'locked' : 'destroyed');
    });
  }
  test('vault destruction: waits for a dispatched write before clearing its ciphertext', async () => {
    const f = await fixture(LocalSecretVault); const entered = deferred(), release = deferred();
    f.hooks.beforeWrite = async () => { entered.resolve(); await release.promise; };
    const write = observe(f.write()); await entered.promise;
    const destruction = observe(f.vault.destroy());
    try {
      await turn(); assert.equal(f.counts.clears, 0); assert.equal(destruction.status, 'pending');
      await assert.rejects(f.vault.unlock(SECRET), /vault_locked/);
    } finally { release.resolve(); await Promise.all([write.done, destruction.done]); }
    assert.equal(write.status, 'fulfilled', 'already-dispatched commit is not represented as rolled back');
    assert.equal(destruction.status, 'fulfilled'); assert.equal(f.counts.writes, 1);
    assert.equal(f.header(), null); assert.equal(f.records.size, 0);
  });
  test('vault destruction: failed clear leaves locked state and allows only explicit recovery', async () => {
    const f = await fixture(LocalSecretVault); await f.write();
    const before = clone([...f.records]); const cause = new Error('synthetic storage unavailable');
    f.hooks.beforeClear = () => { throw cause; };
    await assert.rejects(f.vault.destroy(), error => error === cause);
    assert.equal(f.vault.state, 'locked'); assert.deepEqual([...f.records], before);
    await turn(); assert.equal(f.counts.clears, 1, 'failure does not automatically retry destruction');
    await f.vault.unlock(SECRET); const read = await f.vault.read('sample:one', KIND);
    try { assert.equal(new TextDecoder().decode(read.plaintext), 'synthetic record'); }
    finally { read.plaintext.fill(0); }
    delete f.hooks.beforeClear;
    await f.vault.destroy(); assert.equal(f.counts.clears, 2); assert.equal(f.vault.state, 'destroyed');
  });
  test('vault destruction: ambiguous clear failure never recreates keys or data automatically', async () => {
    const f = await fixture(LocalSecretVault); await f.write();
    f.hooks.afterClear = () => { throw new Error('synthetic acknowledgement lost'); };
    await assert.rejects(f.vault.destroy(), /synthetic acknowledgement lost/);
    assert.equal(f.vault.state, 'locked'); assert.equal(f.header(), null); assert.equal(f.records.size, 0);
    await assert.rejects(f.vault.unlock(SECRET), /vault_not_initialized/);
    assert.equal(f.counts.derivations, 1);
    delete f.hooks.afterClear; await f.vault.destroy(); assert.equal(f.vault.state, 'destroyed');
  });
  test('vault destruction: lock and suspend cannot reopen admission during clear', async () => {
    const f = await fixture(LocalSecretVault); const entered = deferred(), release = deferred();
    f.hooks.beforeClear = async () => { entered.resolve(); await release.promise; };
    const destruction = observe(f.vault.destroy()); await entered.promise;
    try {
      f.vault.lock(); f.vault.suspend(); await f.vault.lockAndDrain();
      await assert.rejects(f.vault.unlock(SECRET), /vault_locked/);
      await assert.rejects(f.write(), /vault_locked/);
    } finally { release.resolve(); await destruction.done; }
    assert.equal(f.vault.state, 'destroyed');
  });
  test('vault destruction: storage callback cannot reenter unlock before clear completes', async () => {
    const f = await fixture(LocalSecretVault); let attempted;
    f.hooks.beforeClear = async () => {
      attempted = observe(f.vault.unlock(SECRET)); await attempted.done;
    };
    await f.vault.destroy();
    assert.equal(attempted.status, 'rejected'); assert.equal(attempted.error.message, 'vault_locked');
    assert.equal(f.counts.derivations, 1); assert.equal(f.vault.state, 'destroyed');
  });
  test('vault destruction: success is terminal and repeated calls do not clear again', async () => {
    const f = await fixture(LocalSecretVault); await f.vault.destroy();
    await f.vault.destroy(); await f.vault.destroy(); f.vault.lock(); f.vault.suspend();
    assert.equal(f.counts.clears, 1); assert.equal(f.vault.state, 'destroyed');
    await assert.rejects(f.vault.unlock(SECRET), /vault_destroyed/);
    await assert.rejects(f.vault.create(SECRET), /vault_state_destroyed/);
  });
  test('vault destruction: failed deletion of corrupt state does not permit unlocking it', async () => {
    const f = await fixture(LocalSecretVault); await f.write();
    f.records.get('sample:one').ciphertext[0] ^= 1;
    await assert.rejects(f.vault.read('sample:one', KIND), /vault_record_corrupt/);
    f.hooks.beforeClear = () => { throw new Error('synthetic clear failure'); };
    await assert.rejects(f.vault.destroy(), /synthetic clear failure/);
    assert.equal(f.vault.state, 'corrupt'); await assert.rejects(f.vault.unlock(SECRET), /vault_corrupt/);
    delete f.hooks.beforeClear; await f.vault.destroy(); assert.equal(f.vault.state, 'destroyed');
  });
}
