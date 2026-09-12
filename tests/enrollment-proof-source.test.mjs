import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const gitHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const manifest = JSON.parse(await read('enrollment-proof-extraction.json'));
test('proof source is byte-identical to the inspected upstream candidate', async () => {
  assert.equal(manifest.sourceRepository, 'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit, 'd984b2fc1980f9d458988de3a1437581e25be234');
  assert.equal(manifest.publicationAllowed, false); assert.match(manifest.ownership, /not migrated/);
  assert.deepEqual(manifest.dependencies, []);
  assert.equal(manifest.files.length, 1);
  const entry = manifest.files[0];
  assert.equal(entry.path, 'packages/client-runtime/src/application-enrollment-proof.ts');
  const bytes = await read(entry.path);
  assert.equal(gitHash(bytes), '8721f0968ef03a83c907ea5cb2c18f28934a5657');
  assert.equal(entry.gitBlob, gitHash(bytes)); assert.equal(entry.bytes, bytes.length);
  assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
});
for (const [name, hash] of [
  ['coordinator', '19a85f356fb4daa4c2c4121fe09bf71a5e90d6db'],
  ['validation', '5c223b74f7140e819c96418510a055b50fd44256'],
  ['types', '0f25ddfb6e03bc13f61e38f22dd6affaa09800e8'],
  ['bound-vault', '0cdf7f1c528b57765e702d1acde77a22837532f3'],
]) {
  test(`existing enrollment ${name} is not changed during proof extraction`, async () => {
    assert.equal(gitHash(await read(`packages/client-runtime/src/application-enrollment-${name}.ts`)), hash);
  });
}
test('new exports preserve private packages and the existing dependency boundary', async () => {
  for (const name of ['client-runtime', 'sdk']) {
    const pkg = JSON.parse(await read(`packages/${name}/package.json`));
    assert.equal(pkg.private, true); assert.equal(pkg.license, 'UNLICENSED'); assert.equal(pkg.sideEffects, false);
    assert.match(pkg.scripts.prepublishOnly, /Publication disabled/);
    assert.deepEqual(pkg.exports['./application-enrollment-proof'], {
      types: './dist/application-enrollment-proof.d.ts', import: './dist/application-enrollment-proof.js',
    });
    assert.deepEqual(pkg.dependencies ?? {}, name === 'sdk' ? { '@nekon/client-runtime': '0.1.0-extraction.0' } : {});
    for (const entry of ['application-event', 'application-authorization', 'application-enrollment', 'application-enrollment-storage']) {
      assert.ok(pkg.exports[`./${entry}`]);
    }
    assert.equal(pkg.exports['.'], undefined);
    const config = JSON.parse(await read(`packages/${name}/tsconfig.json`));
    assert.ok(config.include.includes('src/application-enrollment-proof.ts'));
    assert.equal(config.compilerOptions.strict, true); assert.equal(config.compilerOptions.skipLibCheck, false);
  }
});
test('canonical package lane retains existing suites and registers proof checks with the current explicit artifact budget', async () => {
  const script = (await read('scripts/verify-application-event.mjs')).toString();
  for (const path of ['consumer.test.mjs','transport.test.mjs','lifecycle.cases.mjs','authorization.test.mjs',
    'enrollment/consumer.test.mjs','enrollment-storage/consumer.test.mjs','enrollment-proof/consumer.test.mjs',
    'enrollment-proof/consumer.ts']) assert.ok(script.includes(`'${path}'`));
  assert.ok(script.includes("rootFile('tests/enrollment-proof')"));
  assert.ok(script.includes("'client-runtime': 160 * 1024, sdk: 48000"));
});
test('focused proof subset is explicit and unknown modes fail before verification starts', async () => {
  const script = (await read('scripts/check-enrollment.mjs')).toString();
  assert.ok(script.includes(": ['enrollment', 'enrollment-storage', 'enrollment-proof']"));
  for (const args of [['--skip'], ['--proof-only','--skip']]) {
    const result = spawnSync(process.execPath, ['scripts/check-enrollment.mjs', ...args], {
      cwd: fileURLToPath(root), encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 1); assert.match(result.stderr, /Usage: check-enrollment/);
    assert.doesNotMatch(result.stdout, /PASS/);
  }
});
test('existing storage cases now use production proof with an independently built V1 oracle', async () => {
  const fixture = (await read('tests/enrollment-storage/composition-fixture.mjs')).toString();
  assert.ok(fixture.includes("from '@nekon/sdk/application-enrollment-proof'"));
  assert.ok(fixture.includes("NEKON-ENTERPRISE-AUTHORIZATION-CODE-REDEMPTION-V1\\0"));
  assert.doesNotMatch(fixture, /TEST-ONLY-binding-proof/);
  // The unchanged case suite continues to exercise retry and storage semantics.
  assert.equal(gitHash(await read('tests/enrollment-storage/consumer.test.mjs')), 'd31ee905564ea7f80093c28e6f1fda8d76b21dc5');
  assert.equal(gitHash(await read('tests/enrollment-storage/upstream-binding-cases.mjs')), '82abae42b30e4dc0d812d7f0f2054ea917e3970e');
});
