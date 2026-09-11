# @nekon/client-runtime — extraction preview

Two implemented subpaths: `@nekon/client-runtime/application-event` and
`@nekon/client-runtime/transport`. No framework, CSS, external runtime dependency
or WASM is required for these slices. The root runtime, vault, Room state machine,
MLS and synchronization owners are not included. Packages remain private,
unpublished and licensing-gated at `0.1.0-extraction.0`.

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

## Source ownership and verification

The event codec remains unchanged from the pinned source. The transport sources
match a separately reviewed upstream candidate, recorded in
`transport-extraction.json`; that candidate is not a deployed or merged release.
No independent toolkit transport fork should be maintained. Reconcile the same
upstream candidate before private-consumer cutover. The full SDK is still absent.

`node scripts/verify-application-event.mjs` at the repository root builds and
checks both supported slices using real packages installed offline, rather than
private source aliases. Browser checks use simulated HTTP/socket adapters and
locally fulfilled module requests, not a production connection or CORS audit.
