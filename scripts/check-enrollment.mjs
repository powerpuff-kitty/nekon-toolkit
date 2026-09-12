/** Focused real-source/public-subpath lane. This is NOT a full package/tarball verification. */
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalizeEnrollmentDirectory } from './normalize-enrollment-imports.mjs';

if (process.argv.length !== 2) throw new Error('Usage: check-enrollment.mjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'nekon-enrollment-'));
const localTsc = join(root, 'node_modules/typescript/bin/tsc');
const compiler = existsSync(localTsc) ? process.execPath : 'tsc';
const prefix = existsSync(localTsc) ? [localTsc] : [];
function run(command, args) {
  const env = { ...process.env };
  delete env.NEKON_TRANSPORT_TEST_MODULE;
  const result = spawnSync(command, args, { cwd: directory, env, shell: false,
    encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stdout + result.stderr);
  return result.stdout;
}
try {
  const version = run(compiler, [...prefix, '--version']).trim();
  if (version !== 'Version 5.8.3') throw new Error('Use the pinned TypeScript 5.8.3 compiler');
  const runtime = join(directory, 'node_modules/@nekon/client-runtime');
  const sdk = join(directory, 'node_modules/@nekon/sdk');
  for (const path of [runtime, sdk]) await mkdir(path, { recursive: true });
  // Isolated harness manifests intentionally expose only the selected subpath.
  // Canonical repository manifests and full tarballs are tested in the main lane.
  for (const [name, path] of [['client-runtime', runtime], ['sdk', sdk]]) {
    await writeFile(join(path, 'package.json'), JSON.stringify({name:`@nekon/${name}`,type:'module',private:true,
      exports:{'./application-enrollment':{types:'./application-enrollment.d.ts',import:'./application-enrollment.js'}}}));
  }
  const flags = ['--target','ES2024','--module','ESNext','--moduleResolution','Bundler',
    '--lib','ES2024,DOM,DOM.Iterable','--strict','--noUncheckedIndexedAccess',
    '--exactOptionalPropertyTypes','--verbatimModuleSyntax','--declaration','--noEmitOnError','--skipLibCheck','false'];
  run(compiler,[...prefix,...flags,'--outDir',runtime,join(root,'packages/client-runtime/src/application-enrollment.ts')]);
  await normalizeEnrollmentDirectory(runtime);
  await cp(join(root,'packages/sdk/src/application-enrollment.ts'),join(directory,'sdk-source.ts'));
  run(compiler,[...prefix,...flags,'--outDir',join(directory,'sdk-compiled'),join(directory,'sdk-source.ts')]);
  for (const extension of ['js','d.ts']) await cp(join(directory,`sdk-compiled/sdk-source.${extension}`),join(sdk,`application-enrollment.${extension}`));
  for (const file of ['consumer.test.mjs','enrollment-fixture.mjs','consumer.ts']) {
    await cp(join(root,'tests/enrollment',file),join(directory,file));
  }
  console.log(run(process.execPath,['--test','consumer.test.mjs']));
  run(compiler,[...prefix,'--noEmit','--strict','--target','ES2024','--module','NodeNext',
    '--moduleResolution','NodeNext','--skipLibCheck','false','consumer.ts']);
  console.log(`PASS: focused enrollment public-subpath tests and strict NodeNext types (${version}). No full package, production vault, browser factory, MLS or live enrollment was tested.`);
} finally {
  await rm(directory, {recursive:true,force:true});
}
