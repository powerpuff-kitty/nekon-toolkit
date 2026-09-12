import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  NEKON_APPLICATION_EVENT_SCHEMA, V1_APPLICATION_EVENT_POLICY,
  encodeApplicationEventPayload as encode, inspectApplicationEventPayload as inspect,
  clearApplicationEventPayload as clear, createApplicationEventEncoder,
} from '@nekon/sdk/application-event';
import * as runtime from '@nekon/client-runtime/application-event';

const text = value => new TextEncoder().encode(value);
const input = () => ({
  roomId: 'room_01JABCDEFGHIJKLMNOP', eventId: 'evt_01JAPPLICATIONEVENT0',
  type: 'com.example.task.created', schemaVersion: 1, contentType: 'application/json',
  content: text('{"taskId":"task_123","title":"Review proposal"}'),
  relation: { kind: 'thread', eventId: 'evt_01JPREVIOUSTASK000' },
});
const vector = Buffer.from((await readFile(new URL('./vector.hex', import.meta.url), 'utf8')).trim(), 'hex');

test('packaged SDK matches the unchanged upstream Rust-protocol hex vector', () => {
  assert.deepEqual(Buffer.from(encode(input())), vector);
  assert.deepEqual(inspect(new Uint8Array(vector)), input());
});
test('SDK delegates to the same runtime codec and policy', () => {
  assert.equal(NEKON_APPLICATION_EVENT_SCHEMA, 'nekon.application-event/1');
  assert.equal(V1_APPLICATION_EVENT_POLICY, runtime.V1_APPLICATION_EVENT_POLICY);
  assert.deepEqual(encode(input()), runtime.encodeApplicationEventPayload(input()));
  assert.ok(Object.isFrozen(V1_APPLICATION_EVENT_POLICY));
  assert.throws(() => { V1_APPLICATION_EVENT_POLICY.maximumContentBytes = Infinity; }, TypeError);
});
for (const kind of ['reply', 'thread', 'replace', 'reaction']) {
  test(`round trips the ${kind} relation with empty opaque content`, () => {
    const value = input(); value.relation.kind = kind; value.content = new Uint8Array();
    assert.deepEqual(inspect(encode(value)), value);
  });
}
for (const length of [0, 1, 23, 24, 255, 256, 49152]) {
  test(`round trips ${length} bytes across canonical CBOR length boundaries`, () => {
    const value = input(); value.content = Uint8Array.from({ length }, (_, i) => i % 256);
    assert.deepEqual(inspect(encode(value)), value);
  });
}
for (const schemaVersion of [1, 23, 24, 255, 256, 65535]) {
  test(`round trips schema version ${schemaVersion}`, () => {
    const value = { ...input(), schemaVersion }; assert.deepEqual(inspect(encode(value)), value);
  });
}
for (const length of [16, 128]) {
  test(`round trips minimum/maximum identifier suffix length ${length}`, () => {
    const value = { ...input(), roomId: `room_${'a'.repeat(length)}`, eventId: `evt_${'b'.repeat(length)}` };
    assert.deepEqual(inspect(encode(value)), value);
  });
}
test('relation is optional and inspection returns owned content bytes', () => {
  const value = input(); delete value.relation;
  const encoded = encode(value); const snapshot = encoded.slice();
  const decoded = inspect(encoded); assert.deepEqual(decoded, value);
  assert.notEqual(decoded.content.buffer, encoded.buffer);
  decoded.content.fill(0); assert.deepEqual(encoded, snapshot);
  assert.notEqual(value.content[0], 0);
});
test('clearing decoded content does not erase the separate encoded buffer', () => {
  const encoded = encode(input()); const snapshot = encoded.slice(); const decoded = inspect(encoded);
  clear(decoded); assert.ok(decoded.content.every(byte => byte === 0));
  assert.deepEqual(encoded, snapshot);
  encoded.fill(0); assert.ok(encoded.every(byte => byte === 0));
});
test('draft encoder snapshots content and relation, then binds exact allocated scope', () => {
  const value = input(); const original = structuredClone(value);
  const { roomId, eventId, ...draft } = value;
  const encodeForScope = createApplicationEventEncoder(draft);
  draft.content.fill(0); draft.relation.kind = 'reaction'; draft.type = 'dev.changed.event';
  assert.deepEqual(inspect(encodeForScope({ roomId, eventId })), original);
  const next = { roomId: `room_${'z'.repeat(16)}`, eventId: `evt_${'y'.repeat(16)}` };
  assert.deepEqual(inspect(encodeForScope(next)), { ...original, ...next });
});
test('draft without relation encodes only when a valid scope is supplied', () => {
  const { roomId, eventId, relation: _unused, ...draft } = input();
  const encodeForScope = createApplicationEventEncoder(draft);
  assert.equal(inspect(encodeForScope({ roomId, eventId })).relation, undefined);
  assert.throws(() => encodeForScope({ roomId: 'bad', eventId }), /invalid_application_event_payload/);
});
for (const [label, change, error = /invalid_application_event_payload/] of [
  ['bad Room ID', { roomId: 'room_short' }],
  ['bad Event ID', { eventId: 'evt_short' }],
  ['overlong Room ID', { roomId: `room_${'a'.repeat(129)}` }],
  ['overlong Event ID', { eventId: `evt_${'a'.repeat(129)}` }],
  ['two-part namespace', { type: 'room.admin' }],
  ['uppercase namespace', { type: 'com.Example.event' }],
  ['empty namespace', { type: '' }],
  ['too many namespace segments', { type: 'a.b.c.d.e.f.g.h.i' }],
  ['overlong namespace segment', { type: `com.${'a'.repeat(64)}.event` }],
  ['overlong namespace', { type: Array(8).fill('a'.repeat(63)).join('.') }],
  ['zero schema', { schemaVersion: 0 }],
  ['negative schema', { schemaVersion: -1 }],
  ['fractional schema', { schemaVersion: 1.5 }],
  ['NaN schema', { schemaVersion: NaN }],
  ['infinite schema', { schemaVersion: Infinity }],
  ['overlong schema', { schemaVersion: 65536 }],
  ['uppercase MIME type', { contentType: 'Application/JSON' }],
  ['MIME parameters', { contentType: 'application/json; charset=utf-8' }],
  ['invalid MIME type', { contentType: 'json' }],
  ['overlong MIME type', { contentType: `application/${'a'.repeat(128)}` }],
  ['non-byte content', { content: [1, 2, 3] }],
  ['oversized content', { content: new Uint8Array(49153) }],
  ['self relation', { relation: { kind: 'reply', eventId: input().eventId } }, /invalid_application_event_relation/],
  ['unknown relation', { relation: { kind: 'admin', eventId: input().relation.eventId } }, /invalid_application_event_relation/],
  ['invalid relation target', { relation: { kind: 'reply', eventId: 'bad' } }, /invalid_application_event_relation/],
]) {
  test(`rejects ${label}`, () => assert.throws(() => encode({ ...input(), ...change }), error));
}
test('all truncated prefixes of the upstream vector are rejected', () => {
  for (let n = 0; n < vector.length; n++) {
    assert.throws(() => inspect(new Uint8Array(vector.subarray(0, n))), /invalid_application_event_payload/, `prefix ${n}`);
  }
});
for (const [label, bytes] of [
  ['noncanonical integer width', Uint8Array.from([vector[0], 0x18, 1, ...vector.subarray(2)])],
  ['indefinite array', Uint8Array.from([0x9f, ...vector.subarray(1), 0xff])],
  ['wrong array arity', Uint8Array.from([0x89, ...vector.subarray(1)])],
  ['wrong version', Uint8Array.from([vector[0], 2, ...vector.subarray(2)])],
  ['trailing byte', Uint8Array.from([...vector, 0])],
  ['unsupported integer representation', Uint8Array.from([vector[0], 0x1a, 0, 0, 0, 1, ...vector.subarray(2)])],
  ['invalid UTF-8 kind', Uint8Array.from([vector[0], vector[1], 0x65, 0xff, ...vector.subarray(4)])],
  ['oversized payload', new Uint8Array(65537)],
]) {
  test(`decoder rejects ${label}`, () => assert.throws(() => inspect(bytes), /invalid_application_event_payload/));
}
test('decoder rejects unpaired relation fields', () => {
  const value = input(); delete value.relation;
  const encoded = encode(value);
  const unpaired = Uint8Array.from([...encoded.subarray(0, -2), 0x65, ...text('reply'), 0xf6]);
  assert.throws(() => inspect(unpaired), /invalid_application_event_payload/);
});
test('untrusted encoded input must be a byte array', () => {
  for (const value of [null, undefined, [], 'payload', new ArrayBuffer(1)]) {
    assert.throws(() => inspect(value), /invalid_application_event_payload/);
  }
});
test('deterministic 128-event corpus round trips byte-for-byte', () => {
  let state = 0x1badb002;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  for (let n = 0; n < 128; n++) {
    const value = { ...input(), type: `dev.nekon.sample${n}`, schemaVersion: 1 + next() % 65535,
      content: Uint8Array.from({ length: next() % 513 }, () => next() & 255) };
    const encoded = encode(value); const decoded = inspect(encoded);
    assert.deepEqual(decoded, value); assert.deepEqual(encode(decoded), encoded);
  }
});
test('package does not pretend to export unextracted SDK or runtime entry points', async () => {
  for (const specifier of ['@nekon/sdk', '@nekon/sdk/browser', '@nekon/client-runtime',
    '@nekon/client-runtime/transport', '@nekon/sdk/src/application-event.ts']) {
    await assert.rejects(import(specifier), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
});
