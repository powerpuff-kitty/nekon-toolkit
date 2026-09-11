import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('application-event-extraction.json', root), 'utf8'));
const expected = {
  'packages/sdk/src/application-event.ts': '5bd30392e6220119870fdb9f6fa15d43fe92d353',
  'packages/client-runtime/src/application-event-payload.ts': '6e948d7571243b1f4820aadf7d78cf1ebfc82a68',
  'tests/protocol-vectors/v1-application-event-payload.hex': '80c954b54c61544cdb86b0af89558ab23a681549',
};

test('event source preview remains pinned and not promoted to full SDK ownership', () => {
  assert.equal(manifest.sourceRepository, 'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit, '2b5e093c8663014dde37db98b8d3e7941b33f823');
  assert.equal(manifest.publicationAllowed, false);
  assert.match(manifest.ownership, /not migrated/);
  assert.deepEqual(manifest.files.map(file => file.targetPath).sort(), Object.keys(expected).sort());
});
for (const [path, gitBlob] of Object.entries(expected)) {
  test(`unchanged upstream source: ${path}`, async () => {
    const file = manifest.files.find(file => file.targetPath === path);
    const bytes = await readFile(new URL(path, root));
    assert.equal(file.sourcePath, path);
    assert.equal(file.gitBlob, gitBlob);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), gitBlob);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  });
}
