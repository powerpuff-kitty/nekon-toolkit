# Transport extraction checkpoint — 2026-09-12

Related toolkit work: #3, #6 and #21. This slice extends the event extraction
without claiming completion of the full SDK, Room/MLS migration or source cutover.

## Source and architecture

Three transport source files are staged byte-for-byte from upstream candidate
`powerpuff-kitty/nekon@ebeb424c386930b32fd97d7adc8a68281e817fb8`.
`transport-extraction.json` records their Git blob IDs, byte counts and SHA-256
digests. This is an unmerged, undeployed candidate. Review and reconcile it with
active upstream work before integration; do not modify a second toolkit fork.

The low-level public subpath is `@nekon/client-runtime/transport`, reusing the
existing name. It provides versioned HTTP, session handling, bounded response
consumption and target-bound WebSocket-ticket negotiation. The byte-bound helper
and request-interface declaration are internal implementation modules. No Vue,
CSS, WASM, new cryptographic algorithm or external runtime dependency is added.

The event codec and SDK wrapper remain unchanged. The full `@nekon/sdk` root and
browser/MLS entry points still reject imports. A socket returned by transport is
not necessarily open and grants no Room membership or encryption by itself.
See the runtime guide for cancellation, retry, session and content-access limits.

## Package and verification changes

The existing package lane now tests all supported runtime subpaths together.
Runtime packaging allows exactly 11 files and the SDK wrapper exactly 5. Private
implementation deep imports are rejected, and strict NodeNext types resolve
without source-directory aliases. The build cleans output directories first and
cleans partial outputs on compiler failure. Existing root checks are retained.

## Evidence from this continuation

- 122 installed-package cases passed: 63 existing event cases plus 59 transport
  cases. The event suite changes only the now-supported transport import boundary.
- Four transport-source provenance checks passed.
- Strict TypeScript 5.8.3 build/declaration/consumer checks passed. Identical clean
  builds emitted identical artifacts. Both real tarballs installed offline with
  lifecycle scripts disabled and isolated npm configuration.
- The synthetic event example executed against the installed packages.
- Ten Chromium 144.0.7559.96 / Playwright 1.57.0 transport checks passed using actual
  emitted modules fulfilled in memory and synthetic fetch/WebSocket adapters.
- The same 59 transport cases passed through the upstream supplemental runner;
  they are not 59 additional distinct tests to add to the 122 total.
- Node 22.16.0 and npm 10.9.2 were used with the available TypeScript 5.8.3.

## Not verified

The full foundation/root test lane and older token/event browser gates were not
rerun in this continuation. A fresh public clone/frozen pnpm install was not run;
GitHub/npm host resolution and authenticated Project operations are unavailable
in this environment. Source and tests were materialized through authorized
connector contents; checked event source/fixture hashes matched their baseline.

No real server, TLS, cookie, CORS, cross-browser, Rust/WASM, MLS or encrypted
two-client journey was exercised. Upstream pinned compiler/workspace/security/
agentic checks and coordination with its active enrollment branch remain pending.
The transport candidate requires that review before merge or release; the focused
checks are development evidence, not production assurance or independent auditing.

Live Project 14 membership/fields remain unverified. No main merge, deployment,
publication, signing, secret rotation or GitHub Actions change was performed.
Packages remain private and licensing-gated. The next boundary is the existing
resource/Room owner plus Rust/WASM dependency closure and actual encrypted-client
interoperability, not another generic transport implementation.
