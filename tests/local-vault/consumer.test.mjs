import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { LocalSecretVault, IndexedDbVaultStorage, V1_LOCAL_VAULT_POLICY as policy } from '@nekon/sdk/local-vault';
import * as runtime from '@nekon/client-runtime/local-vault';
import { openBoundApplicationEnrollmentVault } from '@nekon/sdk/application-enrollment-storage';
import { SECRET, KIND, text, decode, clone, memoryStorage, fixtureDeriver, fixture, write, deferred } from './fixture.mjs';

test('SDK vault exports reuse the exact runtime implementation', () => {
  assert.equal(LocalSecretVault, runtime.LocalSecretVault);
  assert.equal(IndexedDbVaultStorage, runtime.IndexedDbVaultStorage);
  assert.equal(policy, runtime.V1_LOCAL_VAULT_POLICY);
  assert.deepEqual(Object.keys(runtime).sort(), ['IndexedDbVaultStorage', 'LocalSecretVault', 'V1_LOCAL_VAULT_POLICY']);
});
test('existing vault cryptographic policy remains explicit and immutable', () => {
  assert.ok(Object.isFrozen(policy));
  assert.equal(policy.kdfId, 'argon2id-v1'); assert.equal(policy.kdfMemoryKiB, 65536);
  assert.equal(policy.kdfIterations, 3); assert.equal(policy.kdfParallelism, 1);
  assert.equal(policy.keyBytes, 32); assert.equal(policy.nonceBytes, 12); assert.equal(policy.tagBits, 128);
  assert.equal(policy.maxRecordBytes, 16777216);
});
test('ciphertext persistence, independently owned reads, lock and reopen', async () => {
  const f = await fixture(); const original = text('synthetic payload');
  await f.vault.write({ recordId: 'sample:one', kind: KIND, plaintext: original, expectedRevision: 0 });
  assert.equal(decode(original), 'synthetic payload');
  const saved = f.storage.records.get('sample:one');
  assert.equal(Buffer.from(saved.ciphertext).includes(Buffer.from(original)), false);
  assert.equal(saved.ciphertext.length, original.length + 16);
  const first = await f.vault.read('sample:one', KIND); first.plaintext.fill(0);
  await f.vault.lockAndDrain(); assert.equal(f.vault.state, 'locked');
  await assert.rejects(f.vault.read('sample:one', KIND), /vault_locked/);
  const next = f.reopen(); await next.unlock(SECRET);
  const result = await next.read('sample:one', KIND);
  assert.equal(decode(result.plaintext), 'synthetic payload'); assert.equal(result.revision, 1); result.plaintext.fill(0);
});
test('records receive independent nonces on each revision', async () => {
  const f = await fixture(); await write(f.vault); const first = clone(f.storage.records.get('sample:one'));
  await write(f.vault, 'sample:one', 'synthetic content', 1);
  assert.notDeepEqual(first.nonce, f.storage.records.get('sample:one').nonce);
  assert.notDeepEqual(first.ciphertext, f.storage.records.get('sample:one').ciphertext);
});
test('wrong unlock secret leaves encrypted records untouched and permits a correct retry', async () => {
  const f = await fixture(); await write(f.vault); const saved = clone([...f.storage.records]);
  const next = f.reopen(); await assert.rejects(next.unlock('synthetic-wrong-secret'), /vault_unlock_failed/);
  assert.equal(next.state, 'locked'); assert.deepEqual([...f.storage.records], saved);
  await next.unlock(SECRET); assert.equal(next.state, 'unlocked');
});
for (const change of ['formatVersion', 'kdf', 'extra']) {
  test(`malformed header ${change} is rejected before key derivation`, async () => {
    const f = await fixture();
    if (change === 'formatVersion') f.storage.header.formatVersion = 2;
    if (change === 'kdf') f.storage.header.kdf.memoryKiB = 1;
    if (change === 'extra') f.storage.header.extra = true;
    let derived = false;
    const next = new LocalSecretVault({ storage: f.storage, deriveKey() { derived = true; throw new Error(); } });
    await assert.rejects(next.unlock(SECRET), /vault_header_corrupt/); assert.equal(derived, false); assert.equal(next.state, 'corrupt');
  });
}
for (const field of ['ciphertext', 'nonce', 'recordId', 'revision', 'deleted', 'updatedAt']) {
  test(`record ${field} tampering is retained and rejects plaintext access`, async () => {
    const f = await fixture(); await write(f.vault); const saved = f.storage.records.get('sample:one');
    if (saved[field] instanceof Uint8Array) saved[field][0] ^= 1;
    else if (field === 'recordId') saved[field] = 'sample:other';
    else if (field === 'deleted') saved[field] = true;
    else saved[field]++;
    const corrupt = clone(saved);
    await assert.rejects(f.vault.read('sample:one', KIND), /vault_record_corrupt/);
    assert.equal(f.vault.state, 'corrupt'); assert.deepEqual(f.storage.records.get('sample:one'), corrupt);
  });
}
test('cross-vault ciphertext and incorrect kinds are rejected', async () => {
  const left = await fixture(); const right = await fixture(); await write(left.vault); await write(right.vault);
  right.storage.records.set('sample:one', clone(left.storage.records.get('sample:one')));
  await assert.rejects(right.vault.read('sample:one', KIND), /vault_record_corrupt/);
  await assert.rejects(left.vault.read('sample:one', 'mls_state'), /vault_record_corrupt/);
});
test('authenticated tombstones preserve monotonically increasing revisions', async () => {
  const f = await fixture(); await write(f.vault);
  assert.equal(await f.vault.delete('sample:one', KIND, 1), 2);
  assert.equal(await f.vault.read('sample:one', KIND), null);
  assert.deepEqual(await f.vault.inspectRecord('sample:one', KIND), { revision: 2, deleted: true });
  await assert.rejects(write(f.vault, 'sample:one', 'new data', 0), /revision_conflict/);
  assert.equal(await write(f.vault, 'sample:one', 'new data', 2), 3);
});
test('concurrent updates commit one revision and retain its authenticated data', async () => {
  const f = await fixture(); await write(f.vault);
  const result = await Promise.allSettled([write(f.vault, 'sample:one', 'first', 1), write(f.vault, 'sample:one', 'second', 1)]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.vault.inspectRecord('sample:one', KIND)).revision, 2);
});
test('multi-record mutation commits all records atomically, including a tombstone', async () => {
  const f = await fixture(); await write(f.vault);
  assert.deepEqual(await f.vault.mutateRecordsAtomically([
    { recordId: 'sample:one', kind: KIND, expectedRevision: 1 },
    { recordId: 'sample:two', kind: KIND, expectedRevision: 0, plaintext: text('two') },
  ]), [2, 1]);
  assert.equal(await f.vault.read('sample:one', KIND), null);
  const result = await f.vault.read('sample:two', KIND); assert.equal(decode(result.plaintext), 'two'); result.plaintext.fill(0);
});
test('failed multi-record CAS commits none of the proposed changes', async () => {
  const f = await fixture(); await write(f.vault); const before = clone([...f.storage.records]);
  await assert.rejects(f.vault.mutateRecordsAtomically([
    { recordId: 'sample:new', kind: KIND, expectedRevision: 0, plaintext: text('not stored') },
    { recordId: 'sample:one', kind: KIND, expectedRevision: 0 },
  ]), /revision_conflict/);
  assert.deepEqual([...f.storage.records], before);
});
test('invalid batch sizes and duplicate identifiers never reach persistence', async () => {
  const f = await fixture();
  const item = { recordId: 'sample:one', kind: KIND, plaintext: text('test'), expectedRevision: 0 };
  for (const input of [[], [item], [item, item], Array.from({length: 9}, (_, i) => ({...item, recordId: `sample:r${i}`}))]) {
    await assert.rejects(f.vault.mutateRecordsAtomically(input), /invalid_vault_record_batch/);
  }
  assert.equal(f.storage.counts.writes, 0);
});
test('unlock-secret replacement rewraps the header without rewriting records', async () => {
  const f = await fixture(); await write(f.vault); const before = clone([...f.storage.records]);
  await f.vault.changeUnlockSecret(SECRET, 'synthetic-new-secret');
  assert.equal(f.storage.header.headerRevision, 2); assert.deepEqual([...f.storage.records], before);
  const next = f.reopen(); await assert.rejects(next.unlock(SECRET), /vault_unlock_failed/);
  await next.unlock('synthetic-new-secret'); assert.equal(next.state, 'unlocked');
});
test('inactivity and explicit suspension revoke access without erasing ciphertext', async () => {
  const f = await fixture({ extra: { inactivityLockMs: 60000 } }); await write(f.vault);
  f.clock.now += 60000; assert.equal(f.vault.state, 'locked');
  assert.equal(f.storage.records.size, 1); await f.vault.unlock(SECRET);
  f.vault.suspend(); await assert.rejects(write(f.vault, 'other'), /vault_locked/);
});
for (const timeout of [0, -1, 59999, 1800001, NaN, Infinity, 60000.5]) {
  test(`invalid inactivity timeout ${timeout} is rejected`, () => {
    assert.throws(() => new LocalSecretVault({storage:memoryStorage(),deriveKey:fixtureDeriver,inactivityLockMs:timeout}), /invalid_vault_inactivity_timeout/);
  });
}
test('lockAndDrain waits for pending reads and does not return their plaintext', async () => {
  const f = await fixture(); await write(f.vault); const entered = deferred(), release = deferred();
  f.storage.hooks.beforeRead = async () => { entered.resolve(); await release.promise; };
  const pending = f.vault.read('sample:one', KIND); await entered.promise;
  const rejected = assert.rejects(pending, /vault_locked/); let drained = false;
  const drain = f.vault.lockAndDrain().then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false); assert.equal(f.vault.state, 'locked');
  release.resolve(); await rejected; await drain; assert.equal(drained, true);
});
test('revocation during key derivation prevents a create from persisting or unlocking', async () => {
  const release = deferred(); const entered = deferred(); const storage = memoryStorage();
  const vault = new LocalSecretVault({ storage, deriveKey: async (...args) => {
    entered.resolve(); await release.promise; return fixtureDeriver(...args);
  } });
  const creating = vault.create(SECRET); await entered.promise; const rejected = assert.rejects(creating, /vault_locked/);
  const drain = vault.lockAndDrain(); release.resolve(); await rejected; await drain;
  assert.equal(storage.header, null); assert.equal(vault.state, 'locked');
});
test('late successful persistence does not resurrect a revoked vault', async () => {
  const f = await fixture(); f.storage.hooks.afterCommit = () => f.vault.lock();
  assert.equal(await write(f.vault), 1); assert.equal(f.vault.state, 'locked');
  const reopened = f.reopen(); await reopened.unlock(SECRET);
  assert.equal((await reopened.inspectRecord('sample:one', KIND)).revision, 1);
});
test('destroy clears local persisted state after operations drain', async () => {
  const f = await fixture(); await write(f.vault); await f.vault.destroy();
  assert.equal(f.vault.state, 'destroyed'); assert.equal(f.storage.header, null); assert.equal(f.storage.records.size, 0);
  await assert.rejects(f.vault.unlock(SECRET), /vault_destroyed/); await f.vault.destroy();
});
test('normalized secret and returned derived-key arrays are cleared after import', async () => {
  const observed = [];
  const f = await fixture({ deriveKey(secret, salt) {
    const key = fixtureDeriver(secret, salt); observed.push(secret, key); return key;
  } });
  assert.equal(f.vault.state, 'unlocked'); assert.equal(observed.length, 2);
  assert.ok(observed.every(value => value.every(byte => byte === 0)));
});
test('non-extractable WebCrypto keys are imported for encryption and decryption only', async () => {
  const imported = [];
  const crypto = { getRandomValues: bytes => webcrypto.getRandomValues(bytes),
    subtle: new Proxy(webcrypto.subtle, { get(target, name) {
      if (name === 'importKey') return async (...args) => { const key = await target.importKey(...args); imported.push(key); return key; };
      const value = Reflect.get(target, name, target); return typeof value === 'function' ? value.bind(target) : value;
    } }) };
  await fixture({extra: {crypto}}); assert.equal(imported.length, 2);
  for (const key of imported) { assert.equal(key.extractable, false); assert.deepEqual(key.usages, ['encrypt', 'decrypt']); }
});
test('invalid secret lengths and derived-key sizes do not create headers', async () => {
  for (const secret of ['short', 'x'.repeat(1025)]) {
    const storage = memoryStorage(); const vault = new LocalSecretVault({storage, deriveKey:fixtureDeriver});
    await assert.rejects(vault.create(secret), /invalid_unlock_secret_length/); assert.equal(storage.header, null);
  }
  const storage = memoryStorage(); const key = new Uint8Array(31).fill(1);
  const vault = new LocalSecretVault({storage, deriveKey: () => key});
  await assert.rejects(vault.create(SECRET), /invalid_derived_key_length/);
  assert.ok(key.every(byte => byte === 0)); assert.equal(storage.header, null);
});
test('actual vault composes with bound enrollment storage across reopen and retirement', async () => {
  const f = await fixture();
  const binding = { purpose:'browser-application-enrollment',serviceOrigin:'https://service.example',
    applicationId:'app_0123456789abcdef',redirectUri:'https://app.example/callback',
    targetIdentityId:'id_0123456789abcdef',targetDeviceId:'dev_0123456789abcdef',
    targetSigningKeyHash:'A'.repeat(43),targetMlsCredentialHash:'A'.repeat(43) };
  const open = (vault, initializeNewVault, context = binding) => openBoundApplicationEnrollmentVault({
    vault, binding:context, initializeNewVault, assertActive() { if (vault.state !== 'unlocked') throw new Error('test_locked'); },
  });
  const store = await open(f.vault, true); assert.equal(await store.read(), null);
  const receipt = {enrolled:true,applicationId:binding.applicationId,authorizationRequestId:'ear_0123456789abcdef',
    accountId:'acct_0123456789abcdef',identityId:binding.targetIdentityId,deviceId:binding.targetDeviceId,duplicate:false};
  const saved = await store.stage({ status:'enrolled',applicationId:binding.applicationId,accountId:receipt.accountId,
    targetIdentityId:binding.targetIdentityId,targetDeviceId:binding.targetDeviceId,authorizationRequestId:receipt.authorizationRequestId,receipt });
  await f.vault.lockAndDrain(); const next = f.reopen(); await next.unlock(SECRET);
  const reopened = await open(next, false); assert.deepEqual(await reopened.read(), saved);
  await assert.rejects(open(next, false, {...binding, serviceOrigin:'https://other.example'}), /binding_mismatch/);
  await reopened.retire(saved.revision); assert.equal(await reopened.read(), null);
  await assert.rejects(open(next, true, {...binding, serviceOrigin:'https://other.example'}), /binding_mismatch/);
});
test('IndexedDB adapter rejects unavailable factories and invalid database names', () => {
  assert.throws(() => new IndexedDbVaultStorage('valid', undefined), /invalid_indexeddb_vault_configuration/);
  for (const name of ['', 'a/b', 'a'.repeat(129)]) assert.throws(() => new IndexedDbVaultStorage(name, {}), /invalid_indexeddb_vault_configuration/);
});

// Explicit manual event-delivery regressions; not a native IndexedDB gate.
import { registerIdbSettlementCases } from './idb-settlement.cases.mjs';
registerIdbSettlementCases(test, { LocalSecretVault, IndexedDbVaultStorage });
