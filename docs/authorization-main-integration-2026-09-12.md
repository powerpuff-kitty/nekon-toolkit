# Authorization integration with current main — 2026-09-12

This checkpoint reconciles authorization PR #36 (`310eb5d`) with the merged
transport on main (`8613bb5`). The integration commit preserves both parents;
no feature branch is force-rewritten. Related work: #3, #6, #13 and #21.

## Reconciliation

The low-level authorization API and all four resource/helper source files are
unchanged. Their source manifest retains its independent `39c8e2b` pin. Transport
retains main's `716be46` pin, exact source bytes, bodyless HEAD/304 behavior and
query-preservation fixes. No wire, credential, cryptographic or runtime dependency
change is introduced by this integration.

The package verifier combines rather than replaces the two branches' consumers.
Default verification includes event, transport, lifecycle, HTTP-semantics and
authorization cases. Optional `--http` adds all three native HTTP groups: original
transport, transport-semantics regressions and authorization. Strict declarations,
private-import rejection, canonical package allowlists, deterministic builds and
both real synthetic examples remain enabled. Six new registration/CLI guards
cover this merge risk; they supplement the actual installed-package run.

The root README, architecture and security status now include the authorization
entry point without implying completed enrollment, trusted receipts or messaging.
The resource submits trusted prepared material and validates shape/correlation;
proof construction, durable enrollment, origin/freshness/identity binding, session
activation and Room authority remain higher-layer integration responsibilities.

## Fresh verification

```sh
npm run check
node scripts/verify-application-event.mjs --http
node scripts/check-package.mjs --types
python3 scripts/check-application-authorization-browser.py --chromium /usr/bin/chromium
python3 scripts/check-transport-http-semantics-browser.py --chromium /usr/bin/chromium
```

- The complete documented root Node fallback passed: **94 root tests** and
  **265 installed-client cases**, plus token generation/drift, roadmap and
  extraction metadata and the token tarball consumer.
- The HTTP-inclusive installed-client lane passed **287 cases**: the same 265
  plus 22 native HTTP cases (18 transport and 4 authorization). The distinct
  Node total is **381**, not the sum of repeated default/HTTP runs.
- The client lane packed both canonical packages, installed them together in a
  fresh offline consumer with lifecycle scripts disabled, checked all **26 files**
  (19 runtime and 7 SDK), verified strict NodeNext types and expected errors,
  executed both examples and checked repeat-build equality.
- Measured unpacked package sizes: runtime **56,249 bytes**, SDK **10,300 bytes**.
  Budgets remain the existing authorization-slice 64 KiB and 48,000 bytes. No
  transport-body, security or release limit was increased during reconciliation.
- The packed token TypeScript consumer passed separately.
- Both existing browser runners passed **14 checks each**, **28 total**, using
  actual emitted modules and synthetic Fetch adapters fulfilled in memory.
  No external requests, page errors or browser-policy changes occurred. Native
  HTTP uses ephemeral loopback servers with teardown, not production endpoints.
- Full root and HTTP-inclusive package commands passed final reruns. Repetition
  does not increase the distinct test totals.

Environment: Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Playwright 1.57.0,
Chromium 144.0.7559.96. All original root test files were restored and verified,
not omitted from dynamic test discovery. Reused package sources, tests, compiler
scripts and consumed metadata were checked against their exact Git object hashes.
The six registration guards and integrated verifier/documentation are new code.

## Limits and landing boundary

This is public unpublished source integration, not a registry release or complete
secure SDK. The local verification tree was reconstructed from supplied source
and GitHub content with hash checks, not a network Git clone. Frozen pnpm install
could not be run (pnpm is unavailable; GitHub DNS also failed in the execution
environment). The documented pre-provisioned Node/npm/TypeScript fallback did run.

Not run: workbench #35 or enrollment #37 at their current heads, the private full
workspace/Vitest/security/agentic suites, production TLS/CORS/cookies, real browser
vault/Worker/KDF, Rust/WASM/MLS, live approval, real socket admission or encrypted
two-client interoperability. Browser checks establish module/adapter behavior,
not those production properties. Historical PR counts are not current evidence.

No private-repository modification, source-ownership cutover, deployment, release
signing, secret rotation, migration, GitHub Actions or Project 14 field mutation.
Packages remain private, UNLICENSED and publication-gated. Broad extraction,
release and independent-client issues remain open.
