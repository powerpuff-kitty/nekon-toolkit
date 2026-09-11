# SDK extraction: declared dependencies and remaining review

Source: `powerpuff-kitty/nekon`, commit
`2b5e093c8663014dde37db98b8d3e7941b33f823`. GitHub's default-branch ref was checked
during this continuation and still pointed to this revision. The file/tree IDs
in `sdk-extraction-inventory.json` identify the inspected inputs.

## Concrete dependency boundary

| Unit | Existing source | Internal dependencies in this inventory |
| --- | --- | --- |
| SDK | `packages/sdk` | Client runtime |
| Client runtime | `packages/client-runtime` | Four generated browser WASM modules |
| Core | `crates/nekon-core` | No internal crate dependency |
| Protocol | `crates/nekon-protocol` | Core |
| Crypto | `crates/nekon-crypto` | Core; Protocol when relevant optional features are enabled |
| Main browser WASM | `crates/nekon-wasm` | Core, Crypto, Protocol |
| Vault KDF WASM | `crates/nekon-vault-kdf-wasm` | Crypto |
| Guest WASM | `crates/nekon-guest-wasm` | Crypto with `guest-room-invitations`, Protocol |
| Call WASM | `crates/nekon-call-wasm` | Core, Crypto with `call-media-sframe`, Protocol |

The graph conservatively includes optional internal dependencies needed by the
current guest/call builds. It is not a demand to expose those features publicly.
New public call/agent/device tooling remains deferred in #30.

## Findings that affect the migration

The SDK bundles two Vite entry points, including its browser adapter, and its
TypeScript configuration extends root `tsconfig.base.json`. The existing
`@nekon/client-runtime` workspace dependency is needed during SDK build. Moving
only `packages/sdk` would not make the public checkout independently buildable.

The current runtime build generates main, vault, guest and call WASM artifacts.
It delegates the call build to `scripts/build-call-wasm.sh` and checks all four
artifacts through `scripts/check-wasm-size.mjs`. These are build dependencies,
including platform/compiler handling and size budgets, not optional documentation.
Before removing a module from the extraction, split the build deliberately and
verify every affected entry point; do not silently disable security functionality.

The seven Rust manifests inherit workspace metadata/dependencies from root
`Cargo.toml`. That workspace also lists native and transport crates outside this
web-focused slice. Recreate the necessary public workspace configuration with
reviewed pins rather than copying the private member list and producing missing
path dependencies. Preserve existing feature flags and protocol/crypto semantics.

The SDK already has an explicit publication gate. Source extraction must not
remove it or turn an unpublished alpha into a claimed production release.

## What the new checker does

`node scripts/check-extraction.mjs --check` validates the metadata and reachable
dependency order without credentials. It rejects invalid paths, duplicate records,
missing references, cycles, disconnected units and unsupported readiness claims.

`--source /path/to/nekon` is an optional read-only maintainer check. It verifies a
clean local Git checkout at the exact revision, checks each recorded blob/tree,
and checks for changes during inspection. External Git filters are rejected
before worktree inspection; global/system Git configuration and object replacement
are disabled for these reads. No source contents are printed, copied or uploaded.
This is a preflight, not an atomic extraction lock or a source-security audit.

## Still pending in #3, then #5/#6

The graph is explicitly **declared-dependencies-only**. Source-level imports,
workers, assets, Rust includes/build scripts and test fixtures still need a
complete review. Package/Rust lockfiles, toolchain pins, inherited settings and
third-party licenses must be preserved or deliberately reconstructed and verified.
Unmerged platform PRs were not fully reconciled in this continuation.

UI/localization and optional enterprise elements remain separate extraction
workstreams (#9); they are not silently added to the framework-neutral SDK.
Neither the private consumer nor any cryptographic source was changed. An
independently buildable SDK plus real two-client/messenger compatibility tests
must precede source-ownership cutover (#12). No package publication is authorized
by passing this metadata checker.
