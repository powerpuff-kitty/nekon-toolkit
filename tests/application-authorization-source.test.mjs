import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('authorization-extraction.json', root), 'utf8'));
const expected = {
  'application-device-authorization-api-resource': 'ff71119ed44655190f1ef1fea857d248d44edbec',
  'client-binary-codec': 'b3a0f42118f92a1bc6c39d53dd2e5f8ef6144fc4',
  'client-api-error': 'e5c4d17684eceac5cdcbd905f4acf939538abe4f',
  'client-response-validation': 'f56985a5ec5d7b061b3e7f105bcb5393c40ddc41',
};
test('authorization extraction records source and incomplete ownership accurately', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceRepository, 'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit, '39c8e2b268e1ee0fd7bf69f21827e1aa0a1dc186');
  assert.equal(manifest.publicationAllowed, false);
  assert.match(manifest.ownership, /not migrated/);
  assert.deepEqual(manifest.files.map(f => f.path).sort(),
    Object.keys(expected).map(n => `packages/client-runtime/src/${n}.ts`).sort());
});
for (const [name, blob] of Object.entries(expected)) {
  test(`unchanged upstream authorization source: ${name}`, async () => {
    const path = `packages/client-runtime/src/${name}.ts`;
    const bytes = await readFile(new URL(path, root));
    const entry = manifest.files.find(f => f.path === path);
    assert.equal(entry.gitBlob, blob);
    assert.equal(entry.bytes, bytes.length);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), blob);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  });
}
