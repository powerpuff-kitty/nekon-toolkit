/** Focused real-source/public-subpath lane. This is NOT a full package/tarball verification. */
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalizeEnrollmentDirectory } from './normalize-enrollment-imports.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--proof-only')) {
  throw new Error('Usage: check-enrollment.mjs [--proof-only]');
}
const proofOnly = args.length === 1;
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
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', private: true }));
  const version = run(compiler, [...prefix, '--version']).trim();
  if (version !== 'Version 5.8.3') throw new Error('Use the pinned TypeScript 5.8.3 compiler');
  const runtime = join(directory, 'node_modules/@nekon/client-runtime');
  const sdk = join(directory, 'node_modules/@nekon/sdk');
  const entries = ['application-enrollment', 'application-enrollment-storage', 'application-enrollment-proof'];
  for (const path of [runtime, sdk]) await mkdir(path, { recursive: true });
  // Isolated harness manifests intentionally expose only the selected subpaths.
  // Canonical repository manifests and full tarballs are tested in the main lane.
  for (const [name, path] of [['client-runtime', runtime], ['sdk', sdk]]) {
    const exports = Object.fromEntries(entries.map(entry => [`./${entry}`, {
      types: `./${entry}.d.ts`, import: `./${entry}.js`,
    }]));
    await writeFile(join(path, 'package.json'), JSON.stringify({ name: `@nekon/${name}`, type: 'module', private: true, exports }));
  }
  const flags = ['--target','ES2024','--module','ESNext','--moduleResolution','Bundler',
    '--lib','ES2024,DOM,DOM.Iterable','--strict','--noUncheckedIndexedAccess',
    '--exactOptionalPropertyTypes','--verbatimModuleSyntax','--declaration','--noEmitOnError','--skipLibCheck','false'];
  run(compiler, [...prefix, ...flags, '--outDir', runtime,
    ...entries.map(entry => join(root, `packages/client-runtime/src/${entry}.ts`))]);
  await normalizeEnrollmentDirectory(runtime);
  await mkdir(join(directory, 'sdk-source'));
  for (const entry of entries) {
    await cp(join(root, `packages/sdk/src/${entry}.ts`), join(directory, 'sdk-source', `${entry}.ts`));
  }
  run(compiler, [...prefix, ...flags, '--outDir', sdk,
    ...entries.map(entry => join(directory, 'sdk-source', `${entry}.ts`))]);
  // Explicit subset option changes tests only, never the code under verification.
  // The default continues to run the earlier coordinator cases as well.
  const suites = proofOnly
    ? ['enrollment-storage', 'enrollment-proof']
    : ['enrollment', 'enrollment-storage', 'enrollment-proof'];
  for (const name of suites) {
    await cp(join(root, 'tests', name), join(directory, name), { recursive: true });
  }
  console.log(run(process.execPath, ['--test', ...suites.map(name => `${name}/consumer.test.mjs`)]));
  run(compiler, [...prefix, '--noEmit', '--strict', '--target', 'ES2024', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--skipLibCheck', 'false',
    ...suites.map(name => `${name}/consumer.ts`)]);
  console.log(`PASS: focused ${proofOnly ? 'proof and bound-storage subset' : 'enrollment, storage and proof'} public-subpath tests and strict NodeNext types (${version}). No full package, production vault, browser factory, MLS or live enrollment was tested.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
