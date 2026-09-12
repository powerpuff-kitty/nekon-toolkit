/** Reconciliation guards; real vault behavior and docs artifacts run in the package lane. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const gate = await read('scripts/verify-application-event.mjs');
const catalog = JSON.parse(await read('docs/portal/catalog.json'));

test('vault reconciliation retains documentation artifact checks and native HTTP groups', () => {
  for (const path of ['tests/docs/consumer.cases.mjs', 'tests/local-vault',
    'http.cases.mjs', 'http-semantics-native.cases.mjs', 'authorization-http.cases.mjs']) {
    assert.ok(gate.includes(`'${path}'`), path);
  }
  assert.ok(gate.includes('Docs artifact ${artifact} differs between installed and local packages'));
  assert.ok(gate.includes("['index.html', 'api.json']"));
});

test('vault public exports, host contract and failed browser gate are documented explicitly', async () => {
  for (const leaf of ['sdk', 'client-runtime']) {
    const entry = catalog.modules.filter(m => m.specifier === `@nekon/${leaf}/local-vault`);
    assert.equal(entry.length, 1);
    assert.match(entry[0].boundary, /Argon2id/);
    assert.match(entry[0].boundary, /IndexedDB verification remains blocked/);
  }
  const example = catalog.examples.find(e => e.id === 'vault-composition');
  assert.equal(example.mode, 'typecheck');
  assert.equal(example.path, 'tests/local-vault/composition.ts');
  assert.ok(gate.includes("'local-vault/composition.ts'"));
  const source = await read(example.path);
  assert.match(source, /declare const deriveKey: VaultKeyDeriver/);
  assert.doesNotMatch(source, /createHash|subtle\.digest|hash_secret_raw/);
});

test('native IndexedDB runner remains a separate real-navigation gate, not an in-memory substitute', async () => {
  const source = await read('scripts/check-local-vault-browser.py');
  assert.ok(source.includes("page.goto(origin + '/', timeout=10000)"));
  assert.ok(source.includes('new IndexedDbVaultStorage(db)'));
  assert.doesNotMatch(source, /set_content|route\.fulfill|disable-web-security|ignoreHTTPSErrors/);
});

test('invalid Argon2 selection fails before build instead of silently omitting reference tests', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nekon-vault-docs-args-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'verify.mjs'), gate);
  for (const mode of ['', 'true', '2', 'yes']) {
    const result = spawnSync(process.execPath, ['verify.mjs'], {
      cwd: directory, env: { ...process.env, NEKON_VAULT_ARGON2_TESTS: mode },
      encoding: 'utf8', shell: false, timeout: 10000,
    });
    assert.equal(result.status, 1, mode);
    assert.match(result.stderr, /NEKON_VAULT_ARGON2_TESTS must be 0 or 1/);
    assert.equal(result.stdout, '');
    assert.deepEqual(await readdir(directory), ['verify.mjs']);
  }
});
