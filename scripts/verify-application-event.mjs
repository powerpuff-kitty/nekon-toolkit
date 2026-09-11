import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'nekon-events-consumer-'));
const rootFile = path => join(root, path);
const execute = (command, args, cwd = directory, npm = false) => {
  const env = npm ? {
    PATH: process.env.PATH, HOME: directory, TMPDIR: directory,
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    npm_config_cache: join(directory, 'cache'), npm_config_offline: 'true',
    npm_config_audit: 'false', npm_config_fund: 'false',
    npm_config_userconfig: join(directory, 'user.npmrc'), npm_config_globalconfig: join(directory, 'global.npmrc'),
  } : process.env;
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
  const before = await artifacts();
  execute(process.execPath, ['scripts/build-application-event.mjs'], root);
  assert.deepEqual(await artifacts(), before, 'Generated source artifacts drift across identical builds');
  const tarballs = [];
  for (const [leaf, module] of [['client-runtime', 'application-event-payload'], ['sdk', 'application-event']]) {
    const packed = JSON.parse(execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], rootFile(`packages/${leaf}`), true));
    assert.equal(packed.length, 1);
    assert.deepEqual(packed[0].files.map(file => file.path).sort(), [
      'LICENSE.md', 'README.md', 'package.json', `dist/${module}.js`, `dist/${module}.d.ts`,
    ].sort(), `Unexpected ${leaf} package files`);
    assert.ok(packed[0].unpackedSize < 48000, `${leaf} exceeds the extraction size budget`);
    assert.equal(packed[0].bundled.length, 0);
    tarballs.push(join(directory, packed[0].filename));
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'nekon-events-clean-consumer', version: '0.0.0', private: true, type: 'module' }));
  execute('npm', ['install', ...tarballs, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], directory, true);
  for (const leaf of ['client-runtime', 'sdk']) {
    const pkg = JSON.parse(await readFile(join(directory, `node_modules/@nekon/${leaf}/package.json`), 'utf8'));
    assert.equal(pkg.private, true);
    assert.equal(pkg.license, 'UNLICENSED');
    assert.equal(pkg.sideEffects, false);
    assert.deepEqual(Object.keys(pkg.exports), ['./application-event']);
    assert.deepEqual(pkg.dependencies ?? {}, leaf === 'sdk' ? { '@nekon/client-runtime': '0.1.0-extraction.0' } : {});
    assert.match(pkg.scripts.prepublishOnly, /Publication disabled/);
  }
  await cp(rootFile('tests/application-event/consumer.test.mjs'), join(directory, 'consumer.test.mjs'));
  await cp(rootFile('tests/application-event/consumer.ts'), join(directory, 'consumer.ts'));
  await cp(rootFile('tests/protocol-vectors/v1-application-event-payload.hex'), join(directory, 'vector.hex'));
  await cp(rootFile('examples/application-event/example.mjs'), join(directory, 'example.mjs'));
  console.log(execute(process.execPath, ['--test', 'consumer.test.mjs']));
  const localTsc = rootFile('node_modules/typescript/bin/tsc');
  execute(existsSync(localTsc) ? process.execPath : 'tsc', [
    ...(existsSync(localTsc) ? [localTsc] : []), '--noEmit', '--strict', '--skipLibCheck', 'false',
    '--target', 'ES2024', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts',
  ]);
  console.log(execute(process.execPath, ['example.mjs']).trim());
  execute(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = () => { throw new Error('Unexpected network call'); };
    delete globalThis.WebSocket;
    const api = await import('@nekon/sdk/application-event');
    if (api.NEKON_APPLICATION_EVENT_SCHEMA !== 'nekon.application-event/1') throw new Error('Unexpected schema');
  `]);
  console.log('PASS: deterministic builds, 2 real tarballs / 10 allowlisted files, isolated offline install, strict consumer types and synthetic example. No registry publication.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
