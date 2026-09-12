# First SDK source slice — 2026-09-12

Related work: #3 (extraction inventory), #5 (public contracts), #6 (existing SDK),
#13 (developer docs) and #21 (package verification). Built on foundation PR #32.
This checkpoint is a source/build preview, not a complete alpha release.

## What moved into public staging

Source revision: `powerpuff-kitty/nekon@2b5e093c8663014dde37db98b8d3e7941b33f823`.
Both source files and the fixed vector below are byte-identical to that revision:

| Path | Git blob |
| --- | --- |
| `packages/sdk/src/application-event.ts` | `5bd30392e6220119870fdb9f6fa15d43fe92d353` |
| `packages/client-runtime/src/application-event-payload.ts` | `6e948d7571243b1f4820aadf7d78cf1ebfc82a68` |
| `tests/protocol-vectors/v1-application-event-payload.hex` | `80c954b54c61544cdb86b0af89558ab23a681549` |

The runtime codec contains no imports, workers, assets, generated modules or
external package dependency. The SDK wrapper imports only the included runtime
codec. TypeScript compiles both independently; the SDK retains a real runtime
package dependency instead of embedding a second implementation. Explicit package
exports expose only `/application-event`. The root SDK and browser/transport paths
fail rather than returning incomplete placeholder clients.

The fixed vector was already referenced by upstream
`packages/client-runtime/src/application-event-payload.test.ts` (blob
`821afcacada14d8488838dcbfcc45a51be6b0494`). New Node consumer tests cover those
scenarios and additional boundaries without importing upstream Vitest tooling.
The Rust test suite itself was not executed during this extraction.

## Reproducible boundaries

`application-event-extraction.json` records source Git IDs, byte counts and SHA-256
digests. Four source-provenance checks reject unreviewed staging changes. The
TypeScript compiler is pinned to 5.8.3, is build-only, and the builder refuses a
different version. The new pnpm lock entry's integrity is taken from the official
package metadata: https://registry.npmjs.org/typescript/5.8.3 . No TypeScript source
or other third-party runtime is vendored into the emitted packages.

The unchanged upstream files retain existing rights. Repository licensing is
still pending #28. Both packages use the explicitly non-release version
`0.1.0-extraction.0`, `private: true` and a publication guard. No registry namespace,
version availability, license clearance or production-readiness claim is made.

## Verification actually performed

- 4 source-provenance tests passed against exact upstream Git blobs.
- 63 tests passed against packages installed from two real npm tarballs into a
  temporary offline consumer, with no workspace source-resolution shortcuts.
- The allowlist contains exactly 5 files per package, 10 in total; runtime code,
  declarations, package metadata and guide/license files only.
- Identical source builds emitted identical artifacts; strict TypeScript 5.8.3
  NodeNext consumer checks (including expected type errors) passed.
- The actual synthetic example executed against installed package exports.
- 9 offline Chromium 144.0.7559.96 / Playwright 1.57.0 checks passed, exercising
  both emitted ESM modules, protocol-vector compatibility, malformed data,
  draft snapshots, buffer ownership and lack of external requests/page errors.
- Node 22.16.0 and npm 10.9.2 were used. The compiler on PATH was TypeScript 5.8.3.

The prior 62 foundation tests and 14 token browser checks were not rerun in this
session; their source was not changed. The new root scripts compose the existing
foundation gate with the event gate. pnpm's frozen install was not executed here;
its manifest/lock entries are provided, while this session used the tested
Node/npm/compiler fallback. These are development checks, not signed release
provenance, a general fuzzing campaign or security certification.

## Security and lifecycle

The application-event payload is plaintext serialization. It has no sender
signature, membership authority, encryption or delivery guarantees by itself.
The full Room controller must allocate/bind scope and authenticate/encrypt it.
Applications must compare inspected IDs to the trusted outer envelope and validate
their own opaque content after authenticated decryption. Relations remain data,
not generic execution authority. No payload contents should enter diagnostics.

Inspection copies opaque bytes. Clearing that copy does not erase the original
encoded buffer or the draft encoder's snapshot, and JavaScript cannot guarantee
complete memory erasure. The guides explicitly document these limits rather
than changing the source semantics during extraction.

## Ownership and remaining work

This is an immutable staging extraction. The private consumer is unchanged and
production source authority remains in `nekon` until coordinated cutover. Any
fix must be reviewed upstream and in the staged source rather than silently
creating divergent implementations. This PR does not close full #3/#5/#6/#12.

Remaining: full runtime import/worker/asset/test closure, Rust/WASM configuration
and lockfiles, active-branch reconciliation, licensing/release review, and the
real messenger plus independent-client encrypted exchange gate. Live Project 14
membership remains unverified. No deployment, registry publication, secret
rotation, GitHub Actions, private-history mirror or cryptographic rewrite occurred.
