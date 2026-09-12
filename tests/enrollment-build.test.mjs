import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEnrollmentImports as normalize } from '../scripts/normalize-enrollment-imports.mjs';
const name='application-enrollment-coordinator.js';
const source='import { validateEnrollmentDraft } from "./application-enrollment-validation";\nexport class Example {}\n';
test('known runtime import gains a .js suffix without changing body',()=>{
  assert.equal(normalize(source,name),source.replace('validation"','validation.js"'));
});
test('normalization is idempotent',()=>{
  const output=normalize(source,name);assert.equal(normalize(output,name),output);
});
test('type imports normalize without relaxing declaration checks',()=>{
  const input='import type { ApplicationEnrollmentDraft } from "./application-enrollment-types";\n';
  assert.equal(normalize(input,'application-enrollment-validation.d.ts'),input.replace('types"','types.js"'));
});
for(const [label,value] of [['missing', 'export class Example {}'],['unknown',source.replace('application-enrollment-validation','unreviewed')],
  ['extra',source+'import { x } from "./unreviewed";\n'],['side effect',source+'import "./unreviewed.js";\n'],
  ['dynamic',source+'const x = import("./unreviewed.js");\n']]){
  test(`normalization rejects ${label} dependency`,()=>assert.throws(()=>normalize(value,name)));
}
test('unknown files cannot request rewriting',()=>assert.throws(()=>normalize(source,'other.js')));
test('types-only output remains unchanged',()=>assert.equal(normalize('export {};\n','application-enrollment-types.js'),'export {};\n'));
