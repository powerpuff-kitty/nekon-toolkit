import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Package only already-built public modules. No network, install, transpilation,
// operator material or second protocol implementation is introduced here.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'examples/developer-workbench');
const output = resolve(source, 'dist/index.html');
const temporary = `${output}.tmp`;
const read = path => readFileSync(resolve(root, path), 'utf8');
const hash = text => createHash('sha256').update(text).digest('base64');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
function replaceOne(template, marker, value) {
  if (template.split(marker).length !== 2) throw new Error(`Invalid workbench template: ${marker}`);
  return template.replace(marker, () => value);
}
try {
  rmSync(output, { force: true });
  rmSync(temporary, { force: true });
  const sdkManifest = JSON.parse(read('packages/sdk/package.json'));
  const runtimeManifest = JSON.parse(read('packages/client-runtime/package.json'));
  if (sdkManifest.exports?.['./application-event']?.import !== './dist/application-event.js' ||
      runtimeManifest.exports?.['./application-event']?.import !== './dist/application-event-payload.js') {
    throw new Error('Review updated public application-event exports before building this example.');
  }
  const modules = {
    '@nekon/sdk/application-event': data(read('packages/sdk/dist/application-event.js')),
    '@nekon/client-runtime/application-event': data(read('packages/client-runtime/dist/application-event-payload.js')),
    'nekon-workbench-model': data(read('examples/developer-workbench/workbench.mjs')),
  };
  const imports = JSON.stringify({ imports: modules });
  const style = read('packages/tokens/dist/scoped.css') + '\n' + read('examples/developer-workbench/style.css');
  const app = read('examples/developer-workbench/app.mjs');
  if (/<\/style/i.test(style) || /<\/script/i.test(app)) throw new Error('Unexpected closing element in trusted example assets.');
  const csp = `default-src 'none'; script-src 'sha256-${hash(imports)}' 'sha256-${hash(app)}' data:; ` +
    `style-src 'sha256-${hash(style)}'; connect-src 'none'; img-src 'none'; font-src 'none'; ` +
    `object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'`;
  let html = read('examples/developer-workbench/index.html');
  for (const [marker, value] of Object.entries({ __CSP__: csp, __STYLE__: style, __IMPORTS__: imports, __APP__: app })) {
    html = replaceOne(html, marker, value);
  }
  if (html.length > 256 * 1024) throw new Error('Workbench exceeded its local artifact budget.');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(temporary, html);
  renameSync(temporary, output);
  console.log('Built examples/developer-workbench/dist/index.html (local plaintext preview; no Cloud connection).');
} catch (error) {
  rmSync(temporary, { force: true });
  rmSync(output, { force: true });
  throw error;
}
