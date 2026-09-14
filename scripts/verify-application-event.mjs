import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, cp, rm, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--http')) {
  throw new Error('Usage: verify-application-event.mjs [--http]');
}
const argon2Mode = process.env.NEKON_VAULT_ARGON2_TESTS;
if (argon2Mode !== undefined && argon2Mode !== '0' && argon2Mode !== '1') {
  throw new Error('NEKON_VAULT_ARGON2_TESTS must be 0 or 1 when provided');
}
const includeArgon2 = process.env.NEKON_VAULT_ARGON2_TESTS === '1';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'nekon-client-consumer-'));
const rootFile = path => join(root, path);
const execute = (command, args, cwd = directory, npm = false) => {
  const env = npm ? {
    PATH: process.env.PATH, HOME: directory, TMPDIR: directory,
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    npm_config_cache: join(directory, 'cache'), npm_config_offline: 'true',
    npm_config_audit: 'false', npm_config_fund: 'false',
    npm_config_userconfig: join(directory, 'user.npmrc'), npm_config_globalconfig: join(directory, 'global.npmrc'),
  } : { ...process.env };
  // Only the private source runner may select a direct module. Packed-consumer
  // checks must resolve the installed public export, never a caller's source file.
  delete env.NEKON_TRANSPORT_TEST_MODULE;
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: false, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stdout + result.stderr}`);
  }
  return result.stdout;
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function artifacts() {
  const result = {};
  for (const leaf of ['client-runtime', 'sdk']) {
    for (const file of (await readdir(rootFile(`packages/${leaf}/dist`))).sort()) {
      result[`${leaf}/${file}`] = hash(await readFile(rootFile(`packages/${leaf}/dist/${file}`)));
    }
  }
  return result;
}
try {
  await writeFile(join(directory, 'user.npmrc'), '');
  await writeFile(join(directory, 'global.npmrc'), '');
  console.log(execute(process.execPath, ['scripts/build-application-event.mjs'], root).trim());
  execute(process.execPath, ['packages/tokens/scripts/build.mjs'], root);
  const before = await artifacts();
  execute(process.execPath, ['scripts/build-application-event.mjs'], root);
  assert.deepEqual(await artifacts(), before, 'Generated source artifacts drift across identical builds');
  const tarballs = [];
  const modules = {
    'client-runtime': ['application-event-payload', 'client-transport', 'client-request-transport', 'bounded-response',
      'application-device-authorization-api-resource', 'client-binary-codec', 'client-api-error', 'client-response-validation',
      'application-enrollment', 'application-enrollment-coordinator', 'application-enrollment-validation', 'application-enrollment-types',
      'application-enrollment-storage', 'application-enrollment-bound-vault', 'application-enrollment-proof', 'local-vault'],
    sdk: ['application-event', 'application-authorization', 'application-enrollment', 'application-enrollment-storage', 'application-enrollment-proof', 'local-vault'],
  };
  // Preserve #39's existing vault artifact budget; HTTP and KDF limits are unrelated.
  const budgets = { 'client-runtime': 160 * 1024, sdk: 48000 };
  let fileCount = 0;
  for (const [leaf, names] of Object.entries(modules)) {
    const packed = JSON.parse(execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], rootFile(`packages/${leaf}`), true));
    assert.equal(packed.length, 1);
    assert.deepEqual(packed[0].files.map(file => file.path).sort(), [
      'LICENSE.md', 'README.md', 'package.json', ...names.flatMap(name => [`dist/${name}.js`, `dist/${name}.d.ts`]),
    ].sort(), `Unexpected ${leaf} package files`);
    assert.ok(packed[0].unpackedSize < budgets[leaf], `${leaf} exceeds the extraction size budget`);
    assert.equal(packed[0].bundled.length, 0);
    fileCount += packed[0].files.length;
    console.log(`${leaf}: ${packed[0].files.length} allowlisted files, ${packed[0].unpackedSize} bytes unpacked.`);
    tarballs.push(join(directory, packed[0].filename));
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'nekon-client-clean-consumer', version: '0.0.0', private: true, type: 'module' }));
  execute('npm', ['install', ...tarballs, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], directory, true);
  for (const leaf of ['client-runtime', 'sdk']) {
    const pkg = JSON.parse(await readFile(join(directory, `node_modules/@nekon/${leaf}/package.json`), 'utf8'));
    assert.equal(pkg.private, true);
    assert.equal(pkg.license, 'UNLICENSED');
    assert.equal(pkg.sideEffects, false);
    assert.deepEqual(Object.keys(pkg.exports), leaf === 'sdk'
      ? ['./application-event', './application-authorization', './application-enrollment', './application-enrollment-storage', './application-enrollment-proof', './local-vault']
      : ['./application-event', './transport', './application-authorization', './application-enrollment', './application-enrollment-storage', './application-enrollment-proof', './local-vault']);
    assert.deepEqual(pkg.dependencies ?? {}, leaf === 'sdk' ? { '@nekon/client-runtime': '0.1.0-extraction.0' } : {});
    assert.match(pkg.scripts.prepublishOnly, /Publication disabled/);
  }
  for (const [source, target] of [
    ['tests/application-event/consumer.test.mjs', 'consumer.test.mjs'],
    ['tests/application-event/consumer.ts', 'consumer.ts'],
    ['tests/transport/consumer.test.mjs', 'transport.test.mjs'],
    ['tests/transport/lifecycle.cases.mjs', 'lifecycle.cases.mjs'],
    ['tests/transport/http-semantics.cases.mjs', 'http-semantics.cases.mjs'],
    ['tests/transport/consumer.ts', 'transport.ts'],
    ['tests/application-authorization/consumer.test.mjs', 'authorization.test.mjs'],
    ['tests/application-authorization/consumer.ts', 'authorization.ts'],
    ['tests/protocol-vectors/v1-application-event-payload.hex', 'vector.hex'],
    ['examples/application-event/example.mjs', 'example.mjs'],
    ['examples/application-authorization/example.mjs', 'authorization-example.mjs'],
  ]) await cp(rootFile(source), join(directory, target));
  await cp(rootFile('tests/enrollment'), join(directory, 'enrollment'), { recursive: true });
  await cp(rootFile('tests/enrollment-storage'), join(directory, 'enrollment-storage'), { recursive: true });
  await cp(rootFile('tests/enrollment-proof'), join(directory, 'enrollment-proof'), { recursive: true });
  await cp(rootFile('tests/local-vault'), join(directory, 'local-vault'), { recursive: true });
  const tests = ['consumer.test.mjs', 'transport.test.mjs', 'lifecycle.cases.mjs', 'http-semantics.cases.mjs', 'authorization.test.mjs',
    'enrollment/consumer.test.mjs', 'enrollment-storage/consumer.test.mjs', 'enrollment-proof/consumer.test.mjs',
    'tests/developer-workbench/workbench.test.mjs', 'local-vault/consumer.test.mjs'];
  if (includeArgon2) tests.push('local-vault/argon2.cases.mjs');
  if (args[0] === '--http') {
    await cp(rootFile('tests/transport/http.cases.mjs'), join(directory, 'http.cases.mjs'));
    await cp(rootFile('tests/transport/http-semantics-native.cases.mjs'), join(directory, 'http-semantics-native.cases.mjs'));
    await cp(rootFile('tests/application-authorization/http.cases.mjs'), join(directory, 'authorization-http.cases.mjs'));
    tests.push('http.cases.mjs', 'http-semantics-native.cases.mjs', 'authorization-http.cases.mjs');
  }
  // Exercise the workbench against the same installed canonical tarballs. The
  // mirrors below are byte-for-byte installed files for its artifact builder,
  // not source aliases or replacement package manifests.
  await cp(rootFile('tests/developer-workbench'), join(directory, 'tests/developer-workbench'), { recursive: true });
  await cp(rootFile('examples/developer-workbench'), join(directory, 'examples/developer-workbench'), {
    recursive: true, filter: source => source !== rootFile('examples/developer-workbench/dist'),
  });
  await mkdir(join(directory, 'scripts'), { recursive: true });
  await cp(rootFile('scripts/build-developer-workbench.mjs'), join(directory, 'scripts/build-developer-workbench.mjs'));
  for (const leaf of ['client-runtime', 'sdk']) {
    await cp(join(directory, `node_modules/@nekon/${leaf}`), join(directory, `packages/${leaf}`), { recursive: true });
  }
  await mkdir(join(directory, 'packages/tokens/dist'), { recursive: true });
  await cp(rootFile('packages/tokens/dist/scoped.css'), join(directory, 'packages/tokens/dist/scoped.css'));
  execute(process.execPath, ['scripts/build-developer-workbench.mjs']);
  execute(process.execPath, ['scripts/build-developer-workbench.mjs'], root);
  assert.deepEqual(
    await readFile(join(directory, 'examples/developer-workbench/dist/index.html')),
    await readFile(rootFile('examples/developer-workbench/dist/index.html')),
    'Workbench built from installed packages differs from local build',
  );
  console.log(execute(process.execPath, ['--test', ...tests]));
  const localTsc = rootFile('node_modules/typescript/bin/tsc');
  execute(existsSync(localTsc) ? process.execPath : 'tsc', [
    ...(existsSync(localTsc) ? [localTsc] : []), '--noEmit', '--strict', '--skipLibCheck', 'false',
    '--target', 'ES2024', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts', 'transport.ts', 'authorization.ts',
    'enrollment/consumer.ts', 'enrollment-storage/consumer.ts', 'enrollment-proof/consumer.ts', 'enrollment/composition.ts', 'local-vault/consumer.ts', 'local-vault/composition.ts',
  ]);
  for (const example of ['example.mjs', 'authorization-example.mjs']) {
    console.log(execute(process.execPath, [example]).trim());
  }
  execute(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = () => { throw new Error('Unexpected network call'); };
    delete globalThis.WebSocket;
    const api = await import('@nekon/sdk/application-event');
    const transport = await import('@nekon/client-runtime/transport');
    const authorization = await import('@nekon/sdk/application-authorization');
    if (typeof authorization.ApplicationDeviceAuthorizationApiResource !== 'function') throw new Error('Unexpected authorization export');
    if (api.NEKON_APPLICATION_EVENT_SCHEMA !== 'nekon.application-event/1' || typeof transport.NekonTransport !== 'function') throw new Error('Unexpected exports');
    const enrollment = await import('@nekon/sdk/application-enrollment');
    const storage = await import('@nekon/sdk/application-enrollment-storage');
    const proof = await import('@nekon/sdk/application-enrollment-proof');
    if (typeof enrollment.ApplicationEnrollmentCoordinator !== 'function' ||
        typeof storage.openBoundApplicationEnrollmentVault !== 'function' ||
        typeof proof.createEnterpriseAuthorizationRedemptionWithSigner !== 'function') throw new Error('Unexpected enrollment exports');
    const vault = await import('@nekon/sdk/local-vault');
    if (typeof vault.LocalSecretVault !== 'function' || typeof vault.IndexedDbVaultStorage !== 'function') throw new Error('Unexpected vault exports');
    const helpers = ['bounded-response', 'client-binary-codec', 'client-api-error', 'client-response-validation',
      'application-enrollment-validation', 'application-enrollment-types', 'application-enrollment-coordinator', 'application-enrollment-bound-vault'];
    for (const specifier of helpers.flatMap(name => ['@nekon/client-runtime/dist/' + name + '.js', '@nekon/client-runtime/' + name])) {
      try { await import(specifier); throw new Error('Private implementation exported'); }
      catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }
    }
  `]);
  // Build the same local docs from actual installed SDK/runtime bytes. Token
  // artifacts are verified in the separate token package lane. No docs source
  // includes are fetched, and no example is replaced by untested prose.
  await cp(rootFile('docs/portal'), join(directory, 'docs/portal'), {
    recursive: true, filter: source => source !== rootFile('docs/portal/dist'),
  });
  for (const script of ['docs-portal.mjs', 'build-docs-portal.mjs', 'verify-application-event.mjs']) {
    await cp(rootFile(`scripts/${script}`), join(directory, 'scripts', script));
  }
  await cp(rootFile('packages/tokens/package.json'), join(directory, 'packages/tokens/package.json'));
  await cp(rootFile('packages/tokens/dist'), join(directory, 'packages/tokens/dist'), { recursive: true });
  for (const example of ['application-event', 'application-authorization']) {
    await cp(rootFile(`examples/${example}/example.mjs`), join(directory, `examples/${example}/example.mjs`));
  }
  await mkdir(join(directory, 'tests/enrollment'), { recursive: true });
  await cp(rootFile('tests/enrollment/composition.ts'), join(directory, 'tests/enrollment/composition.ts'));
  await mkdir(join(directory, 'tests/local-vault'), { recursive: true });
  await cp(rootFile('tests/local-vault/composition.ts'), join(directory, 'tests/local-vault/composition.ts'));
  await cp(rootFile('tests/docs'), join(directory, 'tests/docs'), { recursive: true });
  console.log(execute(process.execPath, ['scripts/build-docs-portal.mjs']));
  execute(process.execPath, ['scripts/build-docs-portal.mjs'], root);
  for (const artifact of ['index.html', 'api.json']) {
    assert.deepEqual(await readFile(join(directory, `docs/portal/dist/${artifact}`)),
      await readFile(rootFile(`docs/portal/dist/${artifact}`)),
      `Docs artifact ${artifact} differs between installed and local packages`);
  }
  console.log(execute(process.execPath, ['--test', 'tests/docs/consumer.cases.mjs']));
  console.log(`PASS: deterministic clean builds, 2 tarballs / ${fileCount} allowlisted files, offline install, event/transport/lifecycle/authorization/enrollment/workbench consumer suites, strict types, both synthetic examples and generated docs. Argon2 reference: ${includeArgon2 ? 'included' : 'not run'}. Native HTTP: ${args[0] === '--http' ? 'included' : 'not run'}. No registry publication.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
