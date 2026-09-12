/** Integration orchestration tests; real SDK behavior runs in installed packages. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const root = new URL('../', import.meta.url);
const verifier = await readFile(new URL('scripts/verify-application-event.mjs', root), 'utf8');

test('root workbench commands retain the complete main package checks', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.scripts.check, 'node scripts/verify.mjs && node scripts/verify-application-event.mjs');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs && node scripts/verify-application-event.mjs');
  assert.equal(pkg.scripts['check:workbench'], 'node scripts/verify-application-event.mjs');
  assert.equal(pkg.scripts.build, 'node packages/tokens/scripts/build.mjs && node scripts/build-application-event.mjs && node scripts/build-developer-workbench.mjs');
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, 'UNLICENSED');
});

test('workbench tests resolve supported exports in the canonical installed consumer', async () => {
  const cases = await readFile(new URL('tests/developer-workbench/workbench.test.mjs', root), 'utf8');
  assert.match(cases, /from '@nekon\/sdk\/application-event'/);
  assert.doesNotMatch(cases, /from '\.\.\/\.\.\/packages\/sdk\/dist/);
  assert.ok(verifier.includes("'tests/developer-workbench/workbench.test.mjs'"));
  assert.ok(verifier.includes('`node_modules/@nekon/${leaf}`'));
  assert.ok(verifier.includes("'--offline', '--ignore-scripts'"));
});

test('local HTML must equal the artifact built from installed package bytes', () => {
  assert.match(verifier, /assert\.deepEqual\(\s*await readFile\(join\(directory, 'examples\/developer-workbench\/dist\/index\.html'\)\)/);
  assert.ok(verifier.includes("'Workbench built from installed packages differs from local build'"));
  assert.ok(verifier.includes("['packages/tokens/scripts/build.mjs']"));
  assert.match(verifier, /filter: source => source !== rootFile\('examples\/developer-workbench\/dist'\)/);
});

for (const failure of ['missing-module', 'bad-template', 'closing-script', 'oversized-artifact']) {
  test(`workbench builder clears stale and partial output on ${failure}`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'nekon-workbench-build-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const write = async (path, value) => {
      const destination = join(directory, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, value);
    };
    await write('scripts/build-developer-workbench.mjs', await readFile(new URL('scripts/build-developer-workbench.mjs', root)));
    await write('packages/sdk/package.json', JSON.stringify({ exports: { './application-event': { import: './dist/application-event.js' } } }));
    await write('packages/client-runtime/package.json', JSON.stringify({ exports: { './application-event': { import: './dist/application-event-payload.js' } } }));
    if (failure !== 'missing-module') await write('packages/sdk/dist/application-event.js', 'export {};\n');
    await write('packages/client-runtime/dist/application-event-payload.js', 'export {};\n');
    await write('packages/tokens/dist/scoped.css', ':root {}\n');
    await write('examples/developer-workbench/workbench.mjs', 'export {};\n');
    await write('examples/developer-workbench/style.css', 'body {}\n');
    await write('examples/developer-workbench/app.mjs', failure === 'closing-script' ? '</script>' : 'export {};\n');
    await write('examples/developer-workbench/index.html',
      (failure === 'oversized-artifact' ? 'x'.repeat(256 * 1024) : '') +
      (failure === 'bad-template' ? '__CSP__ __STYLE__ __IMPORTS__' : '__CSP__ __STYLE__ __IMPORTS__ __APP__'));
    const output = 'examples/developer-workbench/dist/index.html';
    await write(output, 'stale');
    await write(output + '.tmp', 'partial');
    const result = spawnSync(process.execPath, ['scripts/build-developer-workbench.mjs'], {
      cwd: directory, encoding: 'utf8', shell: false, timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    await assert.rejects(access(join(directory, output)));
    await assert.rejects(access(join(directory, output + '.tmp')));
  });
}
