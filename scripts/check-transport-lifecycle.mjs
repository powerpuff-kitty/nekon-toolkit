/** Isolated supplemental lane; does not replace the repository's existing checks. */
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--http')) {
  throw new Error('Usage: check-transport-lifecycle.mjs [--http]');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'nekon-transport-check-'));
const local = join(root, 'node_modules/typescript/bin/tsc');
const command = existsSync(local) ? process.execPath : 'tsc';
const prefix = existsSync(local) ? [local] : [];
function run(executable, arguments_, env = process.env) {
  const result = spawnSync(executable, arguments_, { cwd: root, env, encoding: 'utf8', shell: false, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stdout + result.stderr);
  return result.stdout;
}
try {
  const compiler = run(command, [...prefix, '--version']).trim();
  await writeFile(join(temporary, 'package.json'), '{"type":"module","private":true}');
  run(command, [...prefix, '--target', 'ES2024', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--lib', 'ES2024,DOM,DOM.Iterable', '--strict', '--noUncheckedIndexedAccess',
    '--exactOptionalPropertyTypes', '--verbatimModuleSyntax', '--declaration', '--noEmitOnError',
    '--skipLibCheck', 'false', '--outDir', temporary,
    'packages/client-runtime/src/client-transport.ts',
    'packages/client-runtime/src/client-request-transport.ts',
    'packages/client-runtime/src/bounded-response.ts']);
  const cases = [
    'tests/transport/consumer.test.mjs',
    'tests/transport/lifecycle.cases.mjs',
  ];
  if (args[0] === '--http') cases.push('tests/transport/http.cases.mjs');
  console.log(run(process.execPath, ['--test', ...cases], {
    ...process.env, NEKON_TRANSPORT_TEST_MODULE: pathToFileURL(join(temporary, 'client-transport.js')).href,
  }));
  console.log(`Transport supplement passed (${compiler}). Loopback HTTP: ${args[0] === '--http' ? 'included' : 'not run'}. Full workspace/browser/server/security lanes are separate.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
