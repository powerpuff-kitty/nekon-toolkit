import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('transport-extraction.json', root), 'utf8'));
const expected = {
  'packages/client-runtime/src/client-transport.ts': 'a17ba8e60a668c34cc3847dfdda9ef6cf1ad0045',
  'packages/client-runtime/src/client-request-transport.ts': '876a0e02793f671dea795ebc3b0c7fc82b2b1b2e',
  'packages/client-runtime/src/bounded-response.ts': '1ec5732b1e0c75807c1f99d958ccf2b8394602ab',
};
test('transport staging records an exact upstream candidate without claiming release or cutover', () => {
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.sourceRepository,'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit,'ebeb424c386930b32fd97d7adc8a68281e817fb8');
  assert.equal(manifest.publicationAllowed,false);
  assert.match(manifest.sourceStatus,/unmerged/);
  assert.match(manifest.ownership,/not migrated/);
  assert.deepEqual(manifest.files.map(f=>f.path).sort(),Object.keys(expected).sort());
});
for (const [path,expectedHash] of Object.entries(expected)) {
  test(`transport source matches upstream candidate: ${path}`,async()=>{
    const bytes=await readFile(new URL(path,root));
    const item=manifest.files.find(f=>f.path===path);
    assert.equal(item.gitBlob,expectedHash);
    assert.equal(item.bytes,bytes.length);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),expectedHash);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  });
}
