import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '../../packages/sdk/dist/application-event.js';
import { createWorkbench, describeError, SAMPLES, SYNTHETIC_SCOPE } from '../../examples/developer-workbench/workbench.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const workbench = createWorkbench(sdk);
const input = (sample = 'message') => ({ ...SYNTHETIC_SCOPE, schemaVersion: '1', ...SAMPLES[sample] });
for (const name of Object.keys(SAMPLES)) {
  test(`actual SDK round-trip preserves the ${name} sample`, () => {
    const result = workbench.encode(input(name));
    assert.equal(result.content, SAMPLES[name].content);
    assert.deepEqual(workbench.inspectHex(result.hex), result);
    assert.equal(JSON.parse(result.metadata).type, SAMPLES[name].type);
    assert.equal(result.representation, 'UTF-8 text');
  });
}
test('unicode bytes are measured, not JavaScript character count', () => {
  const value = '猫 👋 café';
  const result = workbench.encode({ ...input(), content: value });
  assert.equal(result.contentBytes, new TextEncoder().encode(value).length);
  assert.equal(result.content, value);
});
test('empty plain text content is a valid protocol payload', () => {
  assert.equal(workbench.encode({ ...input(), content: '' }).contentBytes, 0);
});
test('48 KiB ASCII content boundary round-trips', () => {
  assert.equal(workbench.encode({ ...input(), content: 'x'.repeat(49152) }).contentBytes, 49152);
});
for (const value of ['x'.repeat(49153), '猫'.repeat(20000)]) {
  test(`oversized content (${value.length} code units) is rejected`, () => {
    assert.throws(() => workbench.encode({ ...input(), content: value }));
  });
}
for (const schema of ['', '0', '-1', '01', '1.5', 'NaN', '65536', '1e3']) {
  test(`invalid schema version ${JSON.stringify(schema)} is rejected`, () => {
    assert.throws(() => workbench.encode({ ...input(), schemaVersion: schema }), /invalid_schema_version/);
  });
}
for (const [field, value] of [['roomId', 'id_0123456789abcdef'], ['eventId', 'not-an-event'], ['type', 'chat'], ['contentType', 'text/html']]) {
  test(`invalid ${field} is rejected by the UI or actual codec`, () => {
    assert.throws(() => workbench.encode({ ...input(), [field]: value }));
  });
}
test('JSON syntax checking does not normalize content bytes', () => {
  const content = '{ "number": 21.50, "label": "test" }';
  assert.equal(workbench.encode({ ...input('telemetry'), content }).content, content);
  assert.throws(() => workbench.encode({ ...input('telemetry'), content: '{bad json' }), /invalid_json/);
});
for (const hex of ['', 'a', '0x00', 'gg', '00;alert(1)', 'ab\u200bcd', 'aa '.repeat(65537), '8a00']) {
  test(`invalid hex or payload (${hex.length} chars) is rejected`, () => {
    assert.throws(() => workbench.inspectHex(hex));
  });
}
test('uppercase and ASCII whitespace round-trip through the real decoder', () => {
  const result = workbench.encode(input());
  assert.deepEqual(workbench.inspectHex('\n' + result.hex.toUpperCase().replaceAll(' ', '\t') + '\r\n'), result);
});
test('trailing bytes and wrong canonical generation are rejected', () => {
  const result = workbench.encode(input());
  assert.throws(() => workbench.inspectHex(result.hex + ' 00'));
  const wrongVersion = result.hex.split(' '); wrongVersion[1] = '02';
  assert.throws(() => workbench.inspectHex(wrongVersion.join(' ')));
});
test('binary content is represented as hex, not silently decoded with replacement', () => {
  const bytes = sdk.encodeApplicationEventPayload({ ...SYNTHETIC_SCOPE, type: 'com.example.binary.data',
    schemaVersion: 1, contentType: 'application/octet-stream', content: new Uint8Array([255, 0, 254]) });
  try {
    const result = workbench.inspectHex(Buffer.from(bytes).toString('hex'));
    assert.equal(result.content, 'ff 00 fe'); assert.equal(result.representation, 'Binary (hex)');
  } finally { bytes.fill(0); }
});
test('existing relations are inspected as data without executing actions', () => {
  const bytes = sdk.encodeApplicationEventPayload({ ...SYNTHETIC_SCOPE, type: 'com.example.chat.message',
    schemaVersion: 1, contentType: 'text/plain', content: new TextEncoder().encode('test'),
    relation: { kind: 'reply', eventId: 'evt_fedcba9876543210' } });
  try { assert.equal(JSON.parse(workbench.inspectHex(Buffer.from(bytes).toString('hex')).metadata).relation.kind, 'reply'); }
  finally { bytes.fill(0); }
});
test('temporary input, encoded and decoded arrays are cleared', () => {
  const buffers = [];
  const observed = createWorkbench({ ...sdk,
    encodeApplicationEventPayload(value) { buffers.push(value.content); const bytes = sdk.encodeApplicationEventPayload(value); buffers.push(bytes); return bytes; },
    inspectApplicationEventPayload(bytes) { const fields = sdk.inspectApplicationEventPayload(bytes); buffers.push(fields.content); return fields; },
  });
  const result = observed.encode(input());
  assert.equal(result.content, SAMPLES.message.content);
  assert.equal(buffers.length, 3);
  assert.ok(buffers.every(bytes => bytes.every(byte => byte === 0)));
});
test('codec failures also clear the UI-owned content buffer', () => {
  let content;
  const observed = createWorkbench({ ...sdk, encodeApplicationEventPayload(value) {
    content = value.content; throw new Error('synthetic failure');
  } });
  assert.throws(() => observed.encode(input()));
  assert.ok(content.every(byte => byte === 0));
});
test('arbitrary errors and prototype names never become user-visible diagnostics', () => {
  for (const message of ['synthetic-secret-canary', 'constructor', 'toString', '__proto__']) {
    assert.equal(describeError(new Error(message)), 'Validation failed. No event was sent or saved.');
  }
});
test('generated page embeds real public assets, blocks network and has matching CSP hashes', () => {
  const html = readFileSync(new URL('../../examples/developer-workbench/dist/index.html', import.meta.url), 'utf8');
  for (const pattern of [/connect-src 'none'/, /form-action 'none'/, /base-uri 'none'/, /Encoding is not encryption/, /Cloud console/]) assert.match(html, pattern);
  for (const source of [html.match(/<style>([\s\S]*?)<\/style>/)[1], ...Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g), m => m[1])]) {
    assert.ok(html.includes(`sha256-${createHash('sha256').update(source).digest('base64')}`));
  }
  const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const [name, file] of [['@nekon/sdk/application-event', '../../packages/sdk/dist/application-event.js'], ['@nekon/client-runtime/application-event', '../../packages/client-runtime/dist/application-event-payload.js']]) {
    assert.equal(Buffer.from(imports[name].split(',')[1], 'base64').toString(), readFileSync(new URL(file, import.meta.url), 'utf8'));
  }
});
test('workbench build is deterministic', () => {
  const path = new URL('../../examples/developer-workbench/dist/index.html', import.meta.url);
  const first = readFileSync(path);
  execFileSync(process.execPath, [new URL('../../scripts/build-developer-workbench.mjs', import.meta.url).pathname]);
  assert.deepEqual(readFileSync(path), first);
});
