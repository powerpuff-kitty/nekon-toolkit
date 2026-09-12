import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAuthorizationImports as normalize } from '../scripts/normalize-authorization-imports.mjs';

const js = 'import { decodeBase64UrlBounded } from "./client-binary-codec";\n' +
  'import { readNekonHttpError } from "./client-api-error";\n' +
  'import { hasExactKeys, isPrefixedOpaqueId, isRecord, } from "./client-response-validation";\n';
const types = 'import type { NekonRequestTransport } from "./client-transport";\n';
test('normalization changes only the pinned JS import-prefix specifiers', () => {
  const body = 'export const sample = \'from "./body-string"\';\n';
  const output = normalize(js + body, 'javascript');
  assert.equal(output, js.replaceAll('";', '.js";') + body);
  assert.equal(normalize(output, 'javascript'), output);
});
test('declaration import receives its Node ESM extension', () => {
  assert.equal(normalize(types + 'export interface Demo {}\n', 'declarations'),
    types.replace('";', '.js";') + 'export interface Demo {}\n');
});
for (const [label, source] of [
  ['missing import', js.split('\n').slice(1).join('\n')],
  ['unreviewed dependency', js.replace('client-binary-codec', 'unknown')],
  ['unsupported extension', js.replace('client-binary-codec', 'client-binary-codec.ts')],
  ['extra relative import', js + 'import { extra } from "./unknown";\n'],
  ['dynamic relative dependency', js + 'export type Value = import("./unknown").Value;\n'],
]) {
  test(`normalization rejects ${label}`, () => assert.throws(() => normalize(source, 'javascript')));
}
test('invalid compiler-output arguments cannot opt into arbitrary rewriting', () => {
  assert.throws(() => normalize(js, 'anything'));
  assert.throws(() => normalize(null, 'javascript'));
});
