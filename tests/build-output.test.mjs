import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const mode of ['wrong-version', 'compiler-failure', 'normalization-failure', 'sdk-failure', 'success']) {
  test(`build output cleanup: ${mode}`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'nekon-build-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const path of ['scripts', 'node_modules/typescript/bin', 'packages/client-runtime/dist', 'packages/sdk/dist']) {
      await mkdir(join(root, path), { recursive: true });
    }
    for (const script of ['build-application-event.mjs', 'normalize-authorization-imports.mjs']) {
      await cp(new URL(`../scripts/${script}`, import.meta.url), join(root, 'scripts', script));
    }
    await writeFile(join(root, 'node_modules/typescript/package.json'), '{"type":"commonjs"}');
    for (const leaf of ['client-runtime', 'sdk']) await writeFile(join(root, `packages/${leaf}/dist/stale.js`), 'stale');
    // Fake compiler tests orchestration only. Real compilation and consumers
    // remain mandatory in the separate installed-package verification lane.
    const imports = ['client-binary-codec', 'client-api-error', 'client-response-validation']
      .map(name => `import { fixture } from "./${name}";`).join('\n') + '\n';
    await writeFile(join(root, 'node_modules/typescript/bin/tsc'), `
const fs = require('node:fs');
if (process.argv.includes('--version')) {
  console.log(${JSON.stringify(mode === 'wrong-version' ? 'Version 0.0.0' : 'Version 5.8.3')});
} else {
  const leaf = process.argv.at(-1).includes('client-runtime') ? 'client-runtime' : 'sdk';
  const path = 'packages/' + leaf + '/dist/';
  fs.mkdirSync(path, {recursive:true});
  fs.writeFileSync(path + 'new.js', 'generated');
  if (leaf === 'client-runtime') {
    fs.writeFileSync(path + 'application-device-authorization-api-resource.js', ${JSON.stringify(mode === 'normalization-failure' ? 'invalid' : imports)});
    fs.writeFileSync(path + 'application-device-authorization-api-resource.d.ts', ${JSON.stringify('import type { Fixture } from "./client-transport";\n')});
  }
  if (${JSON.stringify(mode)} === 'compiler-failure' || (${JSON.stringify(mode)} === 'sdk-failure' && leaf === 'sdk')) process.exitCode = 1;
}
`);
    const result = spawnSync(process.execPath, ['scripts/build-application-event.mjs'], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, mode === 'success' ? 0 : 1, result.stderr);
    for (const leaf of ['client-runtime', 'sdk']) {
      await assert.rejects(access(join(root, `packages/${leaf}/dist/stale.js`)));
      if (mode === 'success') await access(join(root, `packages/${leaf}/dist/new.js`));
      else await assert.rejects(access(join(root, `packages/${leaf}/dist`)));
    }
  });
}
