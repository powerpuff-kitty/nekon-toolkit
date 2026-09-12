# @nekon/sdk — extracted developer tools

Unpublished source preview of the existing NEKON SDK. Available entry points:
`@nekon/sdk/application-event`, `@nekon/sdk/application-authorization`,
`@nekon/sdk/application-enrollment`, `@nekon/sdk/application-enrollment-storage`,
and `@nekon/sdk/application-enrollment-proof`.
The root SDK, browser/MLS adapter and verified Room controller are deliberately
unavailable until their complete dependency sets and integration gates are met.
Version `0.1.0-extraction.0` remains private and licensing-gated; do not expect
these previews from a public npm install.

## Application events

```js
import {
  createApplicationEventEncoder, inspectApplicationEventPayload,
  clearApplicationEventPayload,
} from '@nekon/sdk/application-event';

const encodeForScope = createApplicationEventEncoder({
  type: 'com.example.task.created', schemaVersion: 1,
  contentType: 'application/json',
  content: new TextEncoder().encode('{"taskId":"synthetic-demo"}'),
});
// Synthetic scope only; actual IDs must come from the verified Room controller.
const bytes = encodeForScope({
  roomId: 'room_01JABCDEFGHIJKLMNOP', eventId: 'evt_01JAPPLICATIONEVENT0',
});
const inspected = inspectApplicationEventPayload(bytes);
clearApplicationEventPayload(inspected);
bytes.fill(0);
```

These canonical `nekon.application-event/1` payloads carry opaque content,
reverse-domain types, schema versions 1–65535, lowercase media types and optional
reply/thread/replace/reaction relationships. Content is limited to 48 KiB; total
payloads to 64 KiB. `encodeApplicationEventPayload` accepts a fully bound input.
The draft helper owns a content/relation snapshot and binds scope when invoked.

**Serialization is not encryption.** These bytes contain application plaintext;
the real Room controller must bind the outer envelope, authorize and encrypt the
message. Inspection does not authenticate a sender or grant membership. Validate
the application's opaque content schema only after authenticated decryption and
compare the inspected IDs with the trusted outer envelope. A relation is data,
not an instruction to execute commands or grant authority.

Inspection returns an independent content copy. Clearing it does not clear the
encoded bytes, original input or draft snapshot. Release encoder references after
use; JavaScript cannot guarantee erasure of every copy. No JSON interpretation,
DOM access, networking or cryptographic implementation is included in this codec.

## Application authorization

```ts
import { ApplicationDeviceAuthorizationApiResource } from '@nekon/sdk/application-authorization';
import { NekonTransport } from '@nekon/client-runtime/transport';

const api = new ApplicationDeviceAuthorizationApiResource(
  new NekonTransport('https://service.example.invalid'),
);
```

Use `createEnterpriseAuthorizationRequest(applicationId, preparedRequest)` and
`redeemEnterpriseAuthorization(applicationId, preparedProof)` only with the
existing enrollment coordinator's trusted, immutable material. The SDK export
is the same runtime class, not another implementation or a complete login flow.

The request contains the correlation ID, approved callback, state, PKCE challenge,
identity/device IDs and credential hashes. Redemption carries the same request
ID, returned code, original verifier, signing public key, MLS credential and proof
signature. These values must be generated, bound and durably persisted by the
higher-level enrollment owner. Its framework-neutral coordinator is available
through application-enrollment; production device and vault adapters are not. Never use
test zeros or new random retry material for an actual enrollment.

The resource submits each call once in public credential mode, validates response
shape/correlation, and reports errors. It does not navigate, persist secrets,
compute/verify proofs, create a session, install keys or admit a participant to a
Room. Hosts must check approved authorization origin, expiry and identity bindings;
typed response shape alone does not establish them. Never log proof/code/verifier
values or raw errors. A retry hint does not override operation-idempotency rules.

See the runtime guide for the existing structured HTTP-error fields and limits.
The `Enterprise` method names are preserved for API compatibility, not a new
restriction that only corporate integrations can use these building blocks.

## Resumable enrollment, bound storage and proofs

Use `ApplicationEnrollmentCoordinator` from `@nekon/sdk/application-enrollment`
with trusted device, store, transport and activation adapters. Its methods are
begin, acceptCallback, read, resume and retire. Preparation/callback/receipt writes
precede their corresponding network or activation step. Explicit resume reuses
saved material after ambiguous responses; a saved receipt can recover activation
without repeating redemption. Do not expose raw read() records to presentation,
logging or analytics. Configure the approved service origin and expected scope.

`openBoundApplicationEnrollmentVault` from the storage entry wraps a supplied
secret vault. Encryption, KDF, authenticated metadata and atomic persistence remain
vault-owned. Its proposed V2 envelope is opt-in: it retains service/device binding
when a draft completes or is retired, and rejects V1 data without automatic migration.

`createEnterpriseAuthorizationRedemptionWithSigner` from the proof entry builds
the existing V1 transcript, calls the host's signer and self-checks the result.
No private-key parameter is accepted. The signer returns an owned signature buffer;
the helper clears owned arrays but cannot erase all retained strings or copies.
The coordinator owns callback validation and durable retry decisions; proof creation
performs no HTTP or storage and proves neither server approval nor Room authority.

The production browser factory, vault/Worker/KDF adapters and MLS integration remain
separate. These exports do not constitute a complete browser login or encrypted
messaging client. The repository integration guide records current checks and limits.

## Build and verify

From the repository root with the pinned toolchain installed:

```sh
node scripts/verify-application-event.mjs
```

This builds the supported modules, packs both packages, installs their actual
tarballs in an isolated offline consumer, and runs event, transport, lifecycle,
authorization, enrollment, storage, proof and strict declaration checks. No production endpoint or registry
publication is involved. Source manifests record the unchanged upstream bytes;
staging is not source-ownership cutover, security certification or a live E2EE
interoperability result. Full SDK/Rust/WASM and messenger migration remain open.
