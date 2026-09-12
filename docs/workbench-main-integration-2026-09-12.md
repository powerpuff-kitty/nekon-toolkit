# Workbench integration with main — 2026-09-12

Reconciles PR #35 (`10f5279a2311022fd5aced465b9851e24f616380`) with main
`ec67851a61d838b4eb8c5a3e28856cec34715860`. Both histories are retained.
Related: #19, #13, #14 and #21. No private platform changes.

## Delivered and corrected

The existing local workbench uses the public event SDK to compose and inspect
synthetic messages, telemetry and inert commands. It remains offline, without
login, persistence, fonts, telemetry or a messaging backend. The UI, model, template,
CSS, artifact builder and existing browser runner are unchanged from the PR.

Reproduced clean-environment failure: the old direct test invocation could not
resolve @nekon/client-runtime from the SDK's emitted workspace file. The test now
imports the supported SDK package entry and runs inside the existing canonical
installed-client verifier. The verifier copies installed package bytes for the
artifact builder, not synthetic manifests or source aliases. The resulting HTML
must equal the locally generated artifact. No workspace symlink is required.

Root checks retain the full event/transport/authorization/enrollment/storage/proof
suites and optional 22 native HTTP cases. The 38 original workbench cases retain
all assertions; seven new root cases cover orchestration and builder cleanup.
All package source, manifests, upstream pins and budgets remain unchanged.

## Fresh verification

- `npm run check`: 140 root tests and 482 installed-client tests passed.
- `node scripts/verify-application-event.mjs --http`: 504 installed-client tests
  passed (the same 482 plus 22 native HTTP). Distinct Node total: 644, not a sum
  of overlapping runs. Workbench contributes 38 of the installed-client cases.
- Two real canonical tarballs installed together offline with scripts disabled:
  46 allowed files, runtime 107,183 bytes and SDK 14,559 bytes. Public/hidden export
  boundaries, strict NodeNext/cross-entry types, deterministic builds and both
  synthetic examples pass. Workbench HTML from installed bytes matches local output.
- `node scripts/check-package.mjs --types`: packed token consumer passed.
- Four existing Chromium runners passed: workbench 22, authorization 14, transport
  HTTP semantics 14, storage 14. Total 64 browser checks. Actual emitted modules,
  synthetic adapters; no external requests or page errors. The workbench also
  observed no fetch, socket or browser-storage API calls. Desktop screenshot
  reviewed; automated 320/390px overflow and forced-colors focus checks passed.
- Workbench direct file navigation was attempted once with default policies and
  failed with ERR_BLOCKED_BY_ADMINISTRATOR. No policy was bypassed; the successful
  UI tests use in-memory HTML, not file-navigation or hosted-service evidence.

Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Playwright 1.57.0, Chromium
144.0.7559.96. Checks were run in this continuation, not inferred from old reports.
Full root and HTTP-inclusive package checks passed final reruns.

## Source verification and limits

A network Git clone failed because GitHub DNS was unavailable. The supplied
verification archive was restored and all 104 baseline file hashes checked.
Its complete packages, tests and .github subtrees match the live main Git trees;
reused executable scripts were checked against the live scripts tree. The seven
retrieved workbench source/test files were also hash-matched before editing.
This is a reconstructed verification input tree, not a fresh full checkout.
Frozen pnpm installation was not run; pnpm is unavailable. No CI or independent
review is inferred from local checks or empty GitHub status/review collections.

Not verified: manual screen-reader review, other browser engines, production
browser vault/KDF/Worker/device integration, private workspace/security/agentic
suites, Rust/WASM/MLS, live approval, real socket admission or encrypted two-client
interoperability. Existing storage-browser checks use plaintext test memory;
Node encryption fixtures are not production vaults. V2 remains proposed, opt-in,
without automatic migration. No runtime protection or release gate was changed.

This is a local source-preview merge, not a Cloud console or SDK release. No
registry publication, deployment, secrets, workflow/protection changes, source
ownership cutover or Project 14 field mutations. Broad roadmap issues stay open.
