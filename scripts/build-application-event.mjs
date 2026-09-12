import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { normalizeAuthorizationImports } from './normalize-authorization-imports.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const localTsc = resolve(root, 'node_modules/typescript/bin/tsc');
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
// Clean both outputs before compilation; a failed build must not leave a stale
// previously valid artifact available for an accidental pack/install.
const directories = ['client-runtime', 'sdk'].map(leaf => resolve(root, 'packages', leaf, 'dist'));
for (const path of directories) await rm(path, { recursive: true, force: true });
try {
  if (run(['--version']) !== 'Version 5.8.3') {
    throw new Error('This extraction slice requires pinned TypeScript 5.8.3; run pnpm install --frozen-lockfile.');
  }
  run(['--project', 'packages/client-runtime/tsconfig.json']);
  for (const [extension, kind] of [['js', 'javascript'], ['d.ts', 'declarations']]) {
    const path = resolve(root, 'packages/client-runtime/dist', `application-device-authorization-api-resource.${extension}`);
    await writeFile(path, normalizeAuthorizationImports(await readFile(path, 'utf8'), kind));
  }
  run(['--project', 'packages/sdk/tsconfig.json']);
} catch (error) {
  for (const path of directories) await rm(path, { recursive: true, force: true });
  throw error;
}
console.log('Extracted runtime and application-event SDK built with TypeScript 5.8.3; no publication.');
