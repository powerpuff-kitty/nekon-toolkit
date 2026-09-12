# Transport HTTP integration checkpoint — 2026-09-12

Continues #34 and coordinated private transport work. The previously delivered
HTTP-semantics fixes now match upstream commit
`716be461669f3f6c91ea613c9ec0edd195d5508c` exactly. That upstream candidate is
unmerged; no private-consumer cutover or production approval is implied.

## Correctness changes

A null response body no longer fails a representation Content-Length precheck.
HEAD and 304 metadata are retained, while non-null response streams remain bounded.
Route trimming applies only before the query separator: cursor values, duplicate
parameters, empty values and trailing query slashes are preserved. No credential,
redirect, deadline, retry, API-version, crypto or response-size limit changes.

The upstream patch appends its regression cases to its existing tests. The toolkit
keeps those original test files unchanged and registers the same 26 synthetic and
8 native HTTP scenarios in two dedicated case files. Default verification opens
no test server; --http adds both the existing and new loopback tests against the
same installed canonical packages. Unknown/duplicate flags fail before the build.

## Freshly executed

- `npm run check`: 73 foundation/build/provenance cases and 181 installed-client
  cases passed. Both documented Node lanes executed together, not selected-subpath
  harnesses. Token generation/drift, roadmap/extraction metadata and token tarball
  checks passed as part of that command.
- `node scripts/verify-application-event.mjs --http`: 199 installed-client cases
  passed. This includes the 181 default cases plus 18 native HTTP cases (10 existing
  and 8 new). Do not add these overlapping runs as independent tests.
- `node scripts/check-package.mjs --types`: real token tarball and strict consumer
  types passed. Client/runtime NodeNext types are also checked by the client lane.
- `python3 scripts/check-transport-http-semantics-browser.py --chromium /usr/bin/chromium`:
  14 checks passed using actual emitted modules and synthetic Fetch adapters.
  No external requests, page errors or browser-policy changes.
- The unchanged upstream supplemental runner passed 136 transport cases with
  --http. Those are the same transport scenarios within the toolkit's 199, not
  additional independent coverage.

The client lane packed two actual packages, allowlisted 16 files, installed them
offline with lifecycle scripts disabled, checked exports/dependencies and strict
consumer declarations, reproduced build bytes and executed the real example.
Runtime unpacked size: 39,711 bytes; SDK: 8,138 bytes. Both remain under their
unchanged 48,000-byte budgets. Runtime dependencies and publication guards remain.

Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Playwright 1.57.0 and Chromium
144.0.7559.96. Baseline source was reconstructed from supplied/connector contents,
with executable scripts, all discovered root tests, package sources and consumed
metadata verified against Git object hashes. Token and .github source trees match
upstream exactly. This is not a network clone or signed release provenance.

## Landing boundary and unrun gates

These results support review of the unpublished public transport source preview.
They do not validate the full private workspace, browser application, Room/MLS or
production transport integration. The private source PR remains separately gated;
a public source merge is not a deployment or private-consumer migration.

Not executed: frozen pnpm installation (GitHub/npm DNS unavailable in the execution
environment), original private SDK/Vitest/full-workspace/security/agentic checks,
production TLS/CORS/cookies, live socket admission, Rust/WASM/MLS, browser vault or
encrypted two-client interoperability. The browser harness uses synthetic Fetch;
the native HTTP suite uses ephemeral loopback servers. Earlier browser suites were
not rerun. No Actions, publication, release signing, migration or secret rotation.
