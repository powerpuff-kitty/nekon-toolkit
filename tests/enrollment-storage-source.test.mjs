import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeEnrollmentImports } from '../scripts/normalize-enrollment-imports.mjs';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const gitHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const manifest = JSON.parse(await read('enrollment-storage-extraction.json'));

test('bound storage stays opt-in and pinned to the inspected integration candidate', () => {
  assert.equal(manifest.sourceRepository, 'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit, '3b36676ac162edbe5845848791928a2d5e345d5d');
  assert.equal(manifest.publicationAllowed, false);
  assert.equal(manifest.automaticMigration, false);
  assert.match(manifest.formatStatus, /proposed/);
  assert.match(manifest.ownership, /not migrated/);
});
for (const file of manifest.files) {
  test(`byte-identical upstream storage source: ${file.path}`, async () => {
    const bytes = await read(file.path);
    assert.equal(gitHash(bytes), file.gitBlob);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  });
}
test('upstream binding cases are preserved, not rewritten to fit this extraction', async () => {
  assert.equal(gitHash(await read(manifest.testFixture.path)), '82abae42b30e4dc0d812d7f0f2054ea917e3970e');
});
for (const [name, expected] of [
  ['coordinator', '19a85f356fb4daa4c2c4121fe09bf71a5e90d6db'],
  ['types', '0f25ddfb6e03bc13f61e38f22dd6affaa09800e8'],
  ['validation', '5c223b74f7140e819c96418510a055b50fd44256'],
]) {
  test(`storage extraction leaves parent enrollment ${name} unchanged`, async () => {
    assert.equal(gitHash(await read(`packages/client-runtime/src/application-enrollment-${name}.ts`)), expected);
  });
}
test('public package manifests expose the storage barrel but not helper paths', async () => {
  for (const leaf of ['sdk', 'client-runtime']) {
    const pkg = JSON.parse(await read(`packages/${leaf}/package.json`));
    assert.deepEqual(pkg.exports['./application-enrollment-storage'], {
      types: './dist/application-enrollment-storage.d.ts', import: './dist/application-enrollment-storage.js',
    });
    assert.equal(pkg.private, true); assert.equal(pkg.license, 'UNLICENSED');
    assert.equal(pkg.exports['./application-enrollment-bound-vault'], undefined);
    assert.equal(pkg.exports['.'], undefined);
    assert.match(pkg.scripts.prepublishOnly, /Publication disabled/);
  }
});
for (const [extension, line] of [
  ['js', 'import { validateEnrollmentDraft } from "./application-enrollment-validation";'],
  ['d.ts', 'import type { ApplicationEnrollmentStore } from "./application-enrollment-types";'],
]) {
  const file = `application-enrollment-bound-vault.${extension}`;
  test(`bound storage ${extension} normalizes its known dependency and no body text`, () => {
    const body = '\n// unchanged body\n';
    const normalized = normalizeEnrollmentImports(line + body, file);
    assert.equal(normalized, line.replace('";', '.js";') + body);
    assert.equal(normalizeEnrollmentImports(normalized, file), normalized);
  });
  test(`bound storage ${extension} rejects missing/extra/unknown dependencies`, () => {
    for (const source of ['', line.replace(/\.\/application-enrollment-[a-z]+/, './unknown'),
      line + '\nimport { unknown } from "./unknown";', line + '\nimport("./unknown.js");']) {
      assert.throws(() => normalizeEnrollmentImports(source, file));
    }
  });
}
test('package verification keeps prior suites and registers storage tests and types', async () => {
  const script = (await read('scripts/verify-application-event.mjs')).toString();
  for (const test of ['consumer.test.mjs', 'transport.test.mjs', 'lifecycle.cases.mjs', 'authorization.test.mjs',
    'enrollment/consumer.test.mjs', 'enrollment-storage/consumer.test.mjs', 'enrollment-storage/consumer.ts']) {
    assert.ok(script.includes(`'${test}'`), `Missing registered consumer: ${test}`);
  }
  assert.ok(script.includes("rootFile('tests/enrollment-storage')"));
  assert.ok(script.includes('application-enrollment-bound-vault'));
});
