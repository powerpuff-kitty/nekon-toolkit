# @nekon/sdk — application-event extraction preview

This is the first source slice of the existing NEKON SDK, not a replacement SDK
and not a complete communication client. Only `@nekon/sdk/application-event` is
available here. The root SDK, browser/MLS adapter, transport and Room controller
are deliberately not exported until their dependency closure is extracted.

Version `0.1.0-extraction.0` is unpublished and `private: true`. Do not run
`npm install @nekon/sdk` expecting this preview from a registry. Build and verify
the local sources with `node scripts/verify-application-event.mjs` at the repo root.
The verification installs both real package tarballs into an isolated consumer.

## What this slice provides

Encode and inspect canonical `nekon.application-event/1` payloads with opaque
content bytes, reverse-domain types such as `com.example.task.created`, application
schema versions 1–65535, lowercase MIME types, and optional reply, thread, replace
or reaction relations. Content is bounded to 48 KiB and payloads to 64 KiB.

```js
import {
  createApplicationEventEncoder,
  inspectApplicationEventPayload,
  clearApplicationEventPayload,
} from '@nekon/sdk/application-event';

const encodeForScope = createApplicationEventEncoder({
  type: 'com.example.task.created',
  schemaVersion: 1,
  contentType: 'application/json',
  content: new TextEncoder().encode('{"taskId":"synthetic-demo"}'),
});

// Synthetic example only; actual IDs must come from a verified Room controller.
const bytes = encodeForScope({
  roomId: 'room_01JABCDEFGHIJKLMNOP',
  eventId: 'evt_01JAPPLICATIONEVENT0',
});
const payload = inspectApplicationEventPayload(bytes);
clearApplicationEventPayload(payload);
bytes.fill(0);
```

`encodeApplicationEventPayload(input)` accepts a fully bound payload directly.
`createApplicationEventEncoder(draft)` snapshots the supplied content/relation and
returns the callback used by the existing private controller. It binds the exact
Room and Event IDs when called. That controller is not included in this preview.
The inspector returns a separate copy of the content bytes; clearing it does not
clear the encoded buffer, the original input or the encoder's snapshot. Release
encoder references after use. JavaScript does not guarantee erasure of every copy.

## Security and semantics

**Serialization is not encryption.** These bytes contain application plaintext.
Do not send/store them as though they were encrypted. In a full integration the
verified Room controller must bind the envelope scope, encrypt, authorize, and
send them. An inspected payload alone proves neither sender identity, permissions,
Room membership nor authenticity. Applications must compare it with the trusted
outer envelope and validate their own content schema after authenticated decryption.
A relation is data, not a command to replace records, invoke tools or grant authority.

The codec never parses JSON content, fetches a URL, opens a socket or touches the
DOM. There is no Rust/WASM dependency in this exact slice. No new cryptographic
algorithm was introduced; the two source files are byte-identical to the pinned
upstream source. Matching its fixed Rust-protocol vector is regression evidence,
not a fresh execution of the Rust test suite or a security audit.

See `application-event-extraction.json` and `docs/application-event-extraction.md`
at the repo root for provenance, staging ownership and remaining migration gates.
