# Toolkit architecture

## Implemented source previews

`packages/tokens` owns the reviewed public token snapshot and emits CSS, JSON,
ESM and declarations. It has no communication or UI-framework dependencies.

`packages/client-runtime` exposes the canonical application-event codec,
low-level transport and existing application-authorization resource. `packages/sdk`
exposes the typed event wrapper and an identical authorization-resource re-export.
The full SDK root, encrypted enrollment owner, verified Room controller and
Rust/WASM remain absent from this branch.

Transport owns API-version headers, configured session boundaries, bounded local
response consumption and target-bound WebSocket ticket negotiation. Resource
clients own domain schema validation. The authorization resource submits prepared
requests and redemption material once, in public credential mode, and validates
receipt shape/correlation. It does not generate proofs, persist enrollment, navigate
approval URLs, establish sessions or grant membership. Those operations belong to
the trusted higher-level enrollment owner and its concrete adapters.

A transport socket is not proof of Room membership, readiness, encryption or
delivery. Payload serialization is plaintext until an authenticated/encrypted
Room controller processes it. Host integrations must enforce approved origin,
freshness and identity binding before acting on authorization responses.

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

`application-event-extraction.json`, `transport-extraction.json` and
`authorization-extraction.json` pin their respective exact upstream source slices.
Transport retains the latest coordinated HTTP fixes; authorization retains its
independent unchanged resource/helper pin. Do not reset one manifest merely to
make its commit equal another slice. The upstream candidates are not production
releases. Review upstream and toolkit together; do not create evolving forks.

The private messenger has not switched to these packages. Current production
source authority remains private until coordinated cutover. Reconcile any active
upstream work, pin consumer dependencies, remove duplicate source ownership and
run real SDK-only messenger/independent-client interoperability before that step.
Package, API-date, wire-generation and cipher-suite compatibility remain distinct.

## Verification and exclusions

The client package lane installs real tarballs into an offline external consumer,
tests all supported public subpaths and strict NodeNext declarations, and rejects
private implementation imports. Reconciliation retains both transport and
authorization cases, including their optional native loopback HTTP groups. Static
registration guards supplement rather than replace actual packed execution.
Browser gates use synthetic adapters and locally fulfilled emitted modules;
they are not live-service evidence. See the latest integration checkpoint for
checks run and unresolved full-workspace/release requirements.

No production deployment, registry publication, signing, secret rotation, Actions
workflow or unrelated PR merge occurs in ordinary development. New native/on-prem,
federation/mesh and hardware expansion remain deferred. No local check alone
establishes independent auditing or production readiness.
