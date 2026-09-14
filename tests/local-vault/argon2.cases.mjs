/** Explicit optional lane: pinned Python Argon2 reference, NOT the browser WASM provider. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { LocalSecretVault, V1_LOCAL_VAULT_POLICY as policy } from '@nekon/sdk/local-vault';
import { SECRET, KIND, memoryStorage, fixture, write, decode } from './fixture.mjs';

const reference = `
import sys,json
from importlib.metadata import version
from argon2.low_level import hash_secret_raw,Type
assert version('argon2-cffi') == '25.1.0'
x=json.load(sys.stdin)
result=hash_secret_raw(bytes.fromhex(x['secret']),bytes.fromhex(x['salt']),
 time_cost=3,memory_cost=65536,parallelism=1,hash_len=32,type=Type.ID,version=19)
sys.stdout.write(result.hex())
`;
function deriveKey(secret, salt) {
  // Synthetic test values only; never put secrets in process arguments or logs.
  const result = spawnSync('python3', ['-c', reference], {
    input: JSON.stringify({secret:Buffer.from(secret).toString('hex'),salt:Buffer.from(salt).toString('hex')}),
    encoding:'utf8',shell:false,timeout:15000,maxBuffer:8192,
  });
  if (result.error || result.status !== 0 || !/^[a-f0-9]{64}$/.test(result.stdout)) {
    throw new Error('pinned_argon2_reference_unavailable_or_failed');
  }
  return Uint8Array.from(Buffer.from(result.stdout, 'hex'));
}

test('reference parameters match the existing mandatory Argon2id policy', () => {
  assert.deepEqual([policy.kdfId,policy.kdfMemoryKiB,policy.kdfIterations,policy.kdfParallelism,policy.keyBytes],
    ['argon2id-v1',65536,3,1,32]);
  const first = deriveKey(new TextEncoder().encode(SECRET), new Uint8Array(16).fill(7));
  const second = deriveKey(new TextEncoder().encode(SECRET), new Uint8Array(16).fill(7));
  assert.deepEqual(first,second); first.fill(0); second.fill(0);
});
test('actual vault create, unlock and authenticated read work with reference Argon2id', async () => {
  const f=await fixture({deriveKey}); await write(f.vault); await f.vault.lockAndDrain();
  const reopened=f.reopen(); await assert.rejects(reopened.unlock('synthetic-wrong-secret'), /vault_unlock_failed/);
  await reopened.unlock(SECRET); const result=await reopened.read('sample:one',KIND);
  assert.equal(decode(result.plaintext),'synthetic content'); result.plaintext.fill(0);
});
test('Argon2id rewrap changes the unlocking secret without changing record ciphertext', async () => {
  const f=await fixture({deriveKey}); await write(f.vault); const before=structuredClone([...f.storage.records]);
  await f.vault.changeUnlockSecret(SECRET,'synthetic-second-secret');
  assert.deepEqual([...f.storage.records],before);
  const reopened=f.reopen();await assert.rejects(reopened.unlock(SECRET),/vault_unlock_failed/);
  await reopened.unlock('synthetic-second-secret'); assert.equal(reopened.state,'unlocked');
});
test('NFC-equivalent synthetic secrets unlock the same Argon2id-wrapped key', async () => {
  const storage=memoryStorage(); const vault=new LocalSecretVault({storage,deriveKey});
  await vault.create('synthetic-caf\u00e9-secret'); vault.lock();
  await vault.unlock('synthetic-cafe\u0301-secret'); assert.equal(vault.state,'unlocked');
});
