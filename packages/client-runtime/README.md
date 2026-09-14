# @nekon/client-runtime — extraction preview

Implemented subpaths: `@nekon/client-runtime/application-event`, `transport`,
`application-authorization`, `application-enrollment`,
`application-enrollment-storage`, `application-enrollment-proof`, and `local-vault`, all under
the `@nekon/client-runtime` package. No framework, CSS, external
runtime dependency is added. The local-vault entry requires a host-provided
Argon2id implementation; its production WASM provider is not included. The root
runtime, Room state machine, MLS and synchronization owners are not included. Packages
remain private, unpublished and licensing-gated at `0.1.0-extraction.0`.

## Low-level transport

```ts
import { NekonTransport } from '@nekon/client-runtime/transport';

const transport = new NekonTransport('https://example.invalid', {
  requestTimeoutMs: 20_000,
  responseBodyLimitBytes: 1024 * 1024,
});
// This example hostname is synthetic. Configure your actual approved endpoint.
const discovery = await transport.discover();
```

Use only after installing reviewed local tarballs or a workspace checkout. There
is no registry release of this preview. The transport owns HTTP API-version headers,
optional application/guest sessions, response bounds and target-bound WebSocket
ticket negotiation. Resource clients still own request/response schema validation.
Discovery returns untrusted server data; it does not establish compatibility by
itself. Server credentials and private keys do not belong in browser configuration.

Origins must be HTTPS, except literal localhost/loopback HTTP used for development.
URL credentials are not accepted. Requests remain under `/api/client/v1/` and do
not follow HTTP redirects. Paths should be constructed by resource clients, not
passed through from arbitrary user input. Query values must be encoded normally.
Injected fetch/WebSocket implementations must honor the standard API contracts;
a hostile implementation or compromised endpoint JavaScript is outside this
client transport's trust boundary.

`requestTimeoutMs: 0` disables the automatic read deadline, not the byte limit.
Positive deadlines must fit the supported integer timer range. Ordinary durable
writes are not automatically aborted or retried. An explicit per-request
`deadlineMs` ends local observation, not remote execution. Retry decisions and
reuse of exact idempotency material belong to the owning operation/controller.

Response limits apply to convenience methods, `.body` readers and clones.
Consume or cancel bodies promptly. Abort/deadline/oversize paths cancel local
response consumption; local cancellation is not remote rollback. Successful
metadata and native `Response` semantics are retained. The helper implementation
is not separately exported.

`setApplicationSession`, `clearApplicationSession` and `setRoomGuestSession`
handle existing session strings; they do not enroll or revoke a Device. Guest
transports omit Account cookies/credentials and retain only scoped guest or
allowlisted attachment authority. Public mode suppresses application sessions;
explicit independent authorization headers still require the resource's policy.
Never log credentials or attach them to diagnostic URLs.

`connect`, `connectRoomLive` and existing low-level `connectCall` return newly
constructed sockets after ticket verification, not a guarantee of an OPEN socket,
Room membership, media support, delivery, reconnect handling or encryption. Hosts
own socket listeners and closing. High-level call components remain deferred.

## Application events

Prefer `@nekon/sdk/application-event` for custom payloads. Serialized bytes are
**plaintext**, and successful inspection is neither authentication nor authority.
Bind them to a verified outer envelope and use the actual encrypted Room owner.
See the SDK guide for content ownership, clearing and JavaScript-erasure limits.

## Application authorization

Prefer the identical re-export in `@nekon/sdk/application-authorization`:

```ts
import { ApplicationDeviceAuthorizationApiResource } from '@nekon/sdk/application-authorization';
import { NekonTransport } from '@nekon/client-runtime/transport';

const api = new ApplicationDeviceAuthorizationApiResource(
  new NekonTransport('https://service.example.invalid'),
);
// Inputs must be prepared and durably owned by the enrollment coordinator.
// api.createEnterpriseAuthorizationRequest(applicationId, preparedRequest)
// api.redeemEnterpriseAuthorization(applicationId, preparedProof)
```

The existing method names and routes retain `Enterprise` for compatibility; no
renaming or new protocol is introduced here. Both calls explicitly use public
credential mode and omit cookies/application sessions. The resource validates
request shape, encoded-byte sizes and exact response fields, including request
and application correlation. It does not generate keys, compute or verify PKCE
proofs, open an approval page, capture callbacks, persist enrollment, authenticate
a session, install an MLS state, or authorize Room membership.

Pass trusted, immutable, already prepared inputs; this is not a sanitizer for
arbitrary objects or a replacement for the encrypted enrollment coordinator.
Preparation must bind identity, device, signing and MLS credentials; preserve
exact pending material across ambiguous replies. A shaped receipt alone is not
cryptographic verification, service-origin pinning, or proof of Room access.
The host must check its approved approval origin, freshness and expected identity
bindings before acting on a returned URL or receipt. The resource never navigates.

HTTP failures expose `name: 'NekonHttpError'`, status, a restricted error code and
optional bounded retry hints. Malformed error bodies fall back to `request_failed`.
No retries are performed automatically. Hints are data, not authorization to retry
with fresh material. Do not log proofs, codes, verifier strings, callbacks or raw
errors. Validation, fetch and JSON failures can also throw; do not assume every
exception is a `NekonHttpError`.

## Enrollment building blocks

`application-enrollment` exports the existing four-state coordinator and narrow
adapter contracts. `application-enrollment-storage` adapts a trusted encrypted
secret vault to the coordinator's store interface, binding it to a service,
application, callback, identity, device and credential hashes. `application-enrollment-proof`
constructs the existing V1 signer-based proof and independently checks its signature.
The matching SDK subpaths reuse these implementations rather than duplicating them.

The coordinator exposes begin/acceptCallback/read/resume/retire. It preserves exact
pending material on explicit recovery and saves receipts before activation. Raw
read() snapshots are sensitive, not UI state. Always pin the intended authorization
origin and scope. The host still supplies encrypted persistence/atomic CAS, device
preparation/signing/authentication and idempotent activation. A valid signature or
receipt shape does not grant Room membership or message access.

Bound storage uses an explicit opt-in proposed V2 envelope. Existing V1 records,
missing bindings and mismatched context are retained and rejected, not silently
migrated. Initialization is allowed only after actual vault creation; retirement
does not discard the binding or revoke anything remotely. Do not use test storage
or placeholder credentials in production. The browser factory, production Argon2/WASM provider,
Worker and MLS integration remain outside these source previews.

## Local encrypted vault

`local-vault` exposes the existing `LocalSecretVault`, `IndexedDbVaultStorage`,
immutable V1 policy and typed storage/KDF contracts. It composes with the enrollment
bound-store adapter. The matching SDK subpath re-exports these exact definitions.
This is low-level trusted-host infrastructure, not a ready-to-use browser login.

Supply the approved Argon2id-v1 derivation (64 MiB, three iterations, parallelism
one, 32-byte output). There is no default derivation or cryptographic fallback.
The function contract cannot prove a supplied provider uses the approved algorithm.
Never copy a fast test-only derivation into an application. The actual browser
WASM provider and interoperability checks remain separate requirements.

Create/unlock, encrypted reads/writes, revision-checked batches, authenticated
tombstones, secret rewrap, lock/drain and local destroy retain their existing
semantics. Keep operation inputs immutable until settlement. Plaintext returned
by read() belongs to the caller and should be cleared after use; clearing an array
does not erase every JavaScript/provider/browser copy. Host lifecycle integration
must trigger suspension/locking. These operations provide no remote revocation,
Room membership or protection against compromised endpoint JavaScript.

The IndexedDB class is staged source. Real persistence tests have not passed in
this environment: default loopback navigation was blocked by browser policy.
Do not treat in-memory CAS tests or independent Argon2 reference tests as browser
WASM/IndexedDB evidence. See the repository vault guide for exact commands and gates.

## Source ownership and verification

The event codec remains unchanged from the pinned source. Transport and resource
sources match the coordinated upstream candidate, recorded in the extraction
manifests; it is not a deployed or merged release. Do not maintain a separate
runtime fork. The full SDK and private-consumer cutover remain pending.

`node scripts/verify-application-event.mjs` at the repository root builds and
checks these supported slices using actual packages installed offline, rather
than private source aliases. Browser checks use synthetic adapters and locally
fulfilled modules, not a production connection or CORS audit. The resource source
is unchanged; its emitted relative imports receive a narrow, tested `.js` suffix
normalization so Node ESM and public declarations resolve outside this workspace.
