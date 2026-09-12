import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('reviewed public snapshot matches its provenance digest and counts', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extraction-manifest.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../packages/tokens/src/tokens.json', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), manifest.snapshot.sha256);
  const tokens = JSON.parse(source);
  assert.equal(Object.keys(tokens.base).length, manifest.snapshot.baseTokenCount);
  assert.equal(Object.keys(tokens.themes.dark).length, manifest.snapshot.darkOverrideCount);
  assert.match(manifest.source.gitBlob, /^[a-f0-9]{40}$/);
  assert.match(manifest.migrationStatus, /not migrated/);
});
