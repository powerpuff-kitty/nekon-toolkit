# Toolkit architecture

## Implemented source previews

`packages/tokens` owns the reviewed public token snapshot and emits CSS, JSON,
ESM and declarations. It has no communication or UI-framework dependencies.

`packages/client-runtime` now exposes the canonical application-event codec and
low-level transport. `packages/sdk` exposes only the typed application-event
wrapper, which imports the runtime codec instead of embedding another copy.
The full SDK root, encrypted Room owner, enrollment and Rust/WASM remain absent.

Transport owns API-version headers, configured session boundaries, bounded local
response consumption and target-bound WebSocket ticket negotiation. Resource
clients still own domain schema validation. A transport socket is not proof of
Room membership, readiness, encryption or delivery. Payload serialization is
plaintext until an authenticated/encrypted Room controller processes it.

## Public/private ownership

The toolkit is intended to own reusable SDK/runtime/client Rust-WASM, contracts,
headless bindings, optional UI/tokens, public docs, examples and developer tooling.
The private `nekon` repo retains hosted services, billing, operator tooling,
the control-plane app and first-party messenger. Never move operator/customer
material or private history here as a shortcut to extracting reusable sources.

Generic UI/tokens must not depend on the network SDK; the framework-neutral SDK
must not depend on Vue/React/CSS. Bindings own framework lifecycle, not authority.
The backend consumes shared protocol contracts, not browser/UI implementation.

## Staging and cutover

`application-event-extraction.json` pins the unchanged event source. The separate
`transport-extraction.json` pins the exact upstream transport candidate, including
its shared response helper. That candidate is unmerged and undeployed. Review
upstream and toolkit together; do not create independently evolving transports.

The private messenger has not switched to these packages. Current production
source authority remains private until coordinated cutover. Reconcile any active
upstream work, pin consumer dependencies, remove duplicate source ownership and
run real SDK-only messenger/independent-client interoperability before that step.
Package, API-date, wire-generation and cipher-suite compatibility remain distinct.

## Verification and exclusions

The client package lane installs real tarballs into an offline external consumer,
tests all supported public subpaths and strict NodeNext declarations, and rejects
private implementation imports. Browser gates use synthetic adapters and locally
fulfilled emitted modules; they are not live-service evidence. See the latest
checkpoint for the exact checks run and unresolved full-repository gates.

No production deployment, registry publication, signing, secret rotation, Actions
workflow or unrelated PR merge occurs in ordinary development. New native/on-prem,
federation/mesh and hardware expansion remain deferred. No local check alone
establishes independent auditing or production readiness.
