import { webcrypto, createHash } from 'node:crypto';
import { LocalSecretVault } from '@nekon/sdk/local-vault';

export const SECRET = 'synthetic-vault-secret-only';
export const KIND = 'enterprise_provisioning';
export const text = value => new TextEncoder().encode(value);
export const decode = value => new TextDecoder().decode(value);
export const clone = value => structuredClone(value);

// Test-only in-memory persistence. Atomic commits linearize in one synchronous
// section, after optional hooks; no fake IndexedDB or production storage claim.
export function memoryStorage() {
  let header = null;
  const records = new Map();
  const hooks = {};
  const counts = { reads: 0, writes: 0 };
  return {
    records, hooks, counts,
    get header() { return header; },
    set header(value) { header = value; },
    async readHeader() { return clone(header); },
    async createHeader(value) {
      await hooks.beforeCreate?.();
      if (header) throw new Error('vault_already_initialized');
      header = clone(value);
      await hooks.afterCreate?.();
    },
    async replaceHeader(value, expected) {
      if (header?.headerRevision !== expected) throw new Error('vault_header_revision_conflict');
      header = clone(value);
    },
    async readRecord(id) {
      counts.reads++;
      await hooks.beforeRead?.();
      return clone(records.get(id) ?? null);
    },
    async compareAndSwapRecord(record, expectedRevision) {
      await hooks.beforeCommit?.();
      if ((records.get(record.recordId)?.revision ?? 0) !== expectedRevision) throw new Error('vault_record_revision_conflict');
      if (header?.vaultId !== record.vaultId) throw new Error('vault_header_revision_conflict');
      records.set(record.recordId, clone(record)); counts.writes++;
      await hooks.afterCommit?.();
    },
    async compareAndSwapRecords(entries) {
      await hooks.beforeCommit?.();
      for (const entry of entries) {
        if ((records.get(entry.record.recordId)?.revision ?? 0) !== entry.expectedRevision) throw new Error('vault_record_revision_conflict');
        if (header?.vaultId !== entry.record.vaultId) throw new Error('vault_header_revision_conflict');
      }
      for (const entry of entries) records.set(entry.record.recordId, clone(entry.record));
      counts.writes += entries.length;
    },
    async clear() { header = null; records.clear(); },
  };
}

// Deliberately NOT a password KDF. For cheap vault state-machine tests ONLY.
// Production must supply the exact Argon2id policy. Optional argon2.cases.mjs
// exercises a separately installed, pinned reference implementation instead.
export function fixtureDeriver(secret, salt) {
  return Uint8Array.from(createHash('sha256').update(secret).update(salt).digest());
}
export async function fixture(options = {}) {
  const storage = options.storage ?? memoryStorage();
  const clock = { now: 1000 };
  const deriveKey = options.deriveKey ?? fixtureDeriver;
  const make = extra => new LocalSecretVault({ storage, deriveKey, crypto: webcrypto,
    now: () => clock.now, inactivityLockMs: null, ...extra });
  const vault = make(options.extra);
  await vault.create(SECRET);
  return { vault, storage, clock, reopen: make };
}
export const write = (vault, recordId = 'sample:one', value = 'synthetic content', expectedRevision = 0) =>
  vault.write({ recordId, kind: KIND, plaintext: text(value), expectedRevision });
export function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
