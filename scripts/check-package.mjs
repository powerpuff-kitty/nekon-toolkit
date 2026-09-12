import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--types')) throw new Error('Usage: check-package.mjs [--types]');
const directory = await mkdtemp(join(tmpdir(), 'nekon-consumer-'));
function run(command, arguments_, cwd = directory) {
  const result = spawnSync(command, arguments_, {
    cwd, encoding: 'utf8', shell: false, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, npm_config_cache: join(directory, 'cache'), npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' },
  });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout;
}
try {
  run(process.execPath, ['packages/tokens/scripts/build.mjs'], root);
  const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], join(root, 'packages/tokens')));
  assert.equal(packed.length, 1);
  const expected = ['package.json', 'README.md', 'LICENSE.md', 'dist/index.js', 'dist/index.d.ts', 'dist/tokens.css', 'dist/scoped.css', 'dist/tokens.json'].sort();
  assert.deepEqual(packed[0].files.map(file => file.path).sort(), expected, 'Unexpected package contents');
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'nekon-clean-consumer', private: true, type: 'module' }));
  run('npm', ['install', join(directory, packed[0].filename), '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--no-package-lock']);
  await writeFile(join(directory, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cssVar, getTokens, tokens, tokenNames } from '@nekon/tokens';
assert.equal(cssVar('--nk-color-text'), 'var(--nk-color-text)');
assert.equal(getTokens('dark')['--nk-seed-accent'], '#ff4500');
assert.equal(tokenNames.length, 91);
assert.ok(Object.isFrozen(tokens));
const css = await readFile(new URL(import.meta.resolve('@nekon/tokens/scoped.css')), 'utf8');
assert.ok(!css.includes(':root'));
const data = JSON.parse(await readFile(new URL(import.meta.resolve('@nekon/tokens/tokens.json')), 'utf8'));
assert.equal(data.base['--nk-space-4'], '1rem');
await assert.rejects(import('@nekon/tokens/src/compiler.mjs'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
`);
  run(process.execPath, ['consumer.mjs']);
  if (args[0] === '--types') {
    await writeFile(join(directory, 'consumer.ts'), `
import { cssVar, getTokens, type TokenName } from '@nekon/tokens';
const name: TokenName = '--nk-color-text';
const value: string = cssVar(name);
const dark: string = getTokens('dark')[name];
// @ts-expect-error Unknown token names are not public API.
cssVar('--nk-does-not-exist');
// @ts-expect-error Only explicit light and dark themes exist.
getTokens('automatic');
void value; void dark;
`);
    const version = run('tsc', ['--version']).trim();
    run('tsc', ['--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts']);
    console.log(`Packed consumer TypeScript check passed (${version}).`);
  }
  console.log('Package check passed: 8 allowlisted files; isolated offline install, public exports and hidden-source boundary verified. No registry publication.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
