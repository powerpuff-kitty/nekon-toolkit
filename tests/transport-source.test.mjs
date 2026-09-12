import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('transport-extraction.json', root), 'utf8'));
const expected = {
  'packages/client-runtime/src/client-transport.ts': 'c1351c16618c6459c567fb90946fa3c201c8ec26',
  'packages/client-runtime/src/client-request-transport.ts': '876a0e02793f671dea795ebc3b0c7fc82b2b1b2e',
  'packages/client-runtime/src/bounded-response.ts': 'e0fec3a13924cbbb8106625f4acbc72e7b1626aa',
};
test('transport staging records an exact upstream candidate without claiming release or cutover', () => {
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.sourceRepository,'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit,'39c8e2b268e1ee0fd7bf69f21827e1aa0a1dc186');
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
