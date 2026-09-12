/** Merge-registration guards; actual behavior still runs in the packed-consumer lane. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const source = await readFile(new URL('../scripts/verify-application-event.mjs', import.meta.url), 'utf8');
const quoted = text => [...text.matchAll(/'([^']+)'/g)].map(match => match[1]);

test('default package lane registers both transport regressions and authorization', () => {
  const match = /const tests = \[([^\]]+)\];/.exec(source);
  assert.ok(match, 'Explicit default consumer inventory is required');
  assert.deepEqual(quoted(match[1]), [
    'consumer.test.mjs', 'transport.test.mjs', 'lifecycle.cases.mjs',
    'http-semantics.cases.mjs', 'authorization.test.mjs',
    'enrollment/consumer.test.mjs', 'enrollment-storage/consumer.test.mjs', 'enrollment-proof/consumer.test.mjs',
    'tests/developer-workbench/workbench.test.mjs',
  ]);
  for (const path of ['tests/transport/http-semantics.cases.mjs', 'tests/application-authorization/consumer.test.mjs']) {
    assert.ok(source.includes(`'${path}'`));
  }
});

test('optional HTTP lane preserves original, semantics and authorization groups', () => {
  const match = /if \(args\[0\] === '--http'\) \{([\s\S]*?)\n  \}/.exec(source);
  assert.ok(match, 'Loopback tests must remain explicitly opt-in');
  const registered = /tests\.push\(([^)]+)\)/.exec(match[1]);
  assert.ok(registered);
  assert.deepEqual(quoted(registered[1]), [
    'http.cases.mjs', 'http-semantics-native.cases.mjs', 'authorization-http.cases.mjs',
  ]);
  for (const path of ['tests/transport/http.cases.mjs', 'tests/transport/http-semantics-native.cases.mjs',
    'tests/application-authorization/http.cases.mjs']) assert.ok(match[1].includes(`'${path}'`));
});

test('integration retains strict consumers, both examples and isolated package resolution', () => {
  for (const path of ['consumer.ts', 'transport.ts', 'authorization.ts', 'enrollment/consumer.ts', 'enrollment-storage/consumer.ts', 'enrollment-proof/consumer.ts', 'enrollment/composition.ts', 'example.mjs', 'authorization-example.mjs']) {
    assert.ok(source.includes(`'${path}'`));
  }
  assert.match(source, /delete env\.NEKON_TRANSPORT_TEST_MODULE;/);
  assert.match(source, /'--offline', '--ignore-scripts'/);
  assert.match(source, /'--noEmit', '--strict', '--skipLibCheck', 'false'/);
  assert.ok(source.includes("'client-runtime': 112 * 1024, sdk: 48000"));
});

for (const args of [['--skip'], ['--http', '--http'], ['--http', '--skip']]) {
  test(`invalid package-verifier options fail before build or installation: ${args.join(' ')}`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'nekon-verifier-args-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'verify.mjs'), source);
    const result = spawnSync(process.execPath, ['verify.mjs', ...args], {
      cwd: directory, encoding: 'utf8', shell: false, timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: verify-application-event\.mjs \[--http\]/);
    assert.equal(result.stdout, '');
    assert.deepEqual(await readdir(directory), ['verify.mjs']);
  });
}
