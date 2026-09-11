# Toolkit architecture

## Current implementation

`packages/tokens/src/tokens.json` is the public preview's token source. A pure
build-time compiler validates values/references and emits CSS, JSON, ESM and type
declarations. The root scripts validate the roadmap, package boundaries and a
real packed consumer. There is no network SDK or cryptographic implementation in
this first change.

## Ownership decision

The public repository is intended to own reusable SDK/runtime sources, portable
client Rust/WASM, public contracts, headless bindings, optional UI/tokens, docs,
examples, testing/CLI tools and public AI integration skills. The private `nekon`
repository retains the hosted service, operator tooling, billing, developer
console application and first-party messenger. Reusable console components can
be public without publishing operator implementation or data.

Generic tokens/UI must not depend on the network SDK. The framework-neutral SDK
must not depend on Vue/React/CSS. Framework bindings own framework lifecycle, not
cryptographic authority. Styled communication components compose bindings. The
backend consumes shared protocol contracts, not browser/UI implementation.

## Migration rule

Extract existing `@nekon/sdk`; do not introduce a competing SDK. Inventory and
close the Rust/WASM/build dependency graph before moving it. Version shared
contracts once and test platform/toolkit compatibility. The existing messenger
must use supported public exports and pinned releases, with no permanent private
fork or deep import. Protocol, API-date, cipher-suite and package versions remain
separate compatibility boundaries.

Tokens are a reviewed bootstrap snapshot. The old private stylesheet is NOT
removed or re-pointed in this PR. Production design-token authority remains there
until the coordinated consumer cutover in #3/#12. Do not maintain two diverging
sources: reconcile any upstream changes against the pinned provenance before
migration, then remove duplicate variable ownership in the consumer.

## Explicit exclusions

No production deployment, registry publication, signing, secret rotation,
GitHub Actions workflow or unrelated platform-PR merge. New native/on-premises,
mesh/federation/MQTT and hardware-specific work is deferred. Real independent
client/messenger validation is required before an SDK alpha release claim.
