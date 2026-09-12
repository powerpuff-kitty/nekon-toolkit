import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const localTsc = resolve(root, 'node_modules/typescript/bin/tsc');
// Prefer the lockfile-installed compiler. PATH fallback is for an explicitly
// provisioned contributor toolchain, never a runtime or package dependency.
const command = existsSync(localTsc) ? process.execPath : 'tsc';
const prefix = existsSync(localTsc) ? [localTsc] : [];
function run(args) {
  const result = spawnSync(command, [...prefix, ...args], {
    cwd: root, shell: false, encoding: 'utf8', timeout: 30000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`TypeScript build failed: ${result.error?.message ?? result.stdout + result.stderr}`);
  }
  return result.stdout.trim();
}
if (run(['--version']) !== 'Version 5.8.3') {
  throw new Error('This extraction slice requires pinned TypeScript 5.8.3; run pnpm install --frozen-lockfile.');
}
run(['--project', 'packages/client-runtime/tsconfig.json']);
run(['--project', 'packages/sdk/tsconfig.json']);
console.log('Application-event slice built with TypeScript 5.8.3; no WASM, network or publication.');
