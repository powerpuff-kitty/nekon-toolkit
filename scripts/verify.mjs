import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const manifest = await json('package.json');
const leaf = await json('packages/tokens/package.json');
assert.equal(manifest.private, true, 'Root must not publish');
assert.equal(leaf.private, true, 'Tokens publication is pending release approval');
assert.equal(manifest.license, 'UNLICENSED', 'Licensing review is tracked in #28');
assert.equal(leaf.license, manifest.license);
assert.deepEqual(leaf.sideEffects, ['./dist/*.css']);
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  assert.equal(Object.keys(leaf[field] ?? {}).length, 0, `Tokens must not have ${field}`);
}
assert.equal(leaf.scripts.prepublishOnly, manifest.scripts.prepublishOnly);
assert.equal((await readdir(new URL('.github/', root))).includes('workflows'), false, 'GitHub Actions workflows are not part of this repository policy');

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: fileURLToPath(root), stdio: 'inherit', shell: false, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(`Verification failed: ${args.join(' ')}`);
}
run(['packages/tokens/scripts/build.mjs']);
run(['packages/tokens/scripts/build.mjs', '--check']);
run(['scripts/roadmap.mjs', '--check']);
const tests = (await readdir(new URL('tests/', root))).filter(name => name.endsWith('.test.mjs')).sort();
assert.ok(tests.length > 0, 'Tests must not be empty');
run(['--test', ...tests.map(name => `tests/${name}`)]);
run(['scripts/check-package.mjs']);
console.log('Foundation verification passed. This is not SDK, browser-security or signed release evidence.');
