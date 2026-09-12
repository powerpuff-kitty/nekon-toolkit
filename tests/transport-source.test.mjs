import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('transport-extraction.json', root), 'utf8'));
const expected = {
  'packages/client-runtime/src/client-transport.ts': '639b609d30630c4f0ede81e0a46f82bcce3c5235',
  'packages/client-runtime/src/client-request-transport.ts': '876a0e02793f671dea795ebc3b0c7fc82b2b1b2e',
  'packages/client-runtime/src/bounded-response.ts': '09e74c1e451aa1025b59facb5ec2011017e9652d',
};
test('transport staging records an exact upstream candidate without claiming release or cutover', () => {
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.sourceRepository,'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit,'716be461669f3f6c91ea613c9ec0edd195d5508c');
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
