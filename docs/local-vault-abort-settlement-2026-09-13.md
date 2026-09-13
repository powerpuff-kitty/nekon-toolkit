# Local-vault transaction-abort settlement — 2026-09-13

Continues toolkit #39 / #38 and the coordinated private vault correction.
Toolkit parent: `deaa4916556d2e46854f6f01a65ec16603d2dd62`.
Upstream correction: `22ed8a9e810e3dab52b4e8dae03d93276d9889a3`.
Keep the source-preview PR draft. This is not a production release or a passed
native IndexedDB integration gate.

## Change and reproduction

`IndexedDbVaultStorage.replaceHeader` and `compareAndSwapRecord` now reject
transaction abort events independently of transaction error events. Four handler
lines were added; the source's final newline is normalized to the uploaded bytes.
Existing request/conflict errors retain precedence. Request success alone still
does not resolve the storage operation: successful completion requires the
transaction-complete event. No timeout, retry, permission, public API, encryption,
KDF, record format, CAS rule or package budget was changed.

The original source passes 24 of the 28 new event-delivery cases and fails four:
the two storage operations remain pending on abort-only completion, and the
corresponding actual-vault write/rewrap operation leases prevent drainage.
The corrected source passes all 28. The suite drives the real adapter's callbacks
explicitly; it is not an IndexedDB engine and does not emulate native scheduling,
persistence, rollback or cross-tab coordination. The two vault-composition cases
use actual AES-GCM with header memory and explicitly test-only derivation.

Both repositories use the same corrected runtime source and the same shared
regression suite. The private repository includes a normal Vitest adapter; the
toolkit appends registration to its existing installed-vault consumer, retaining
all earlier assertions. The verifier, package exports, dependencies, native browser
runner and documentation generator remain unchanged. The existing source manifest
now pins the real upstream commit rather than a separately maintained vault.

Fixed source: 44,372 bytes, Git blob
`8d1d61bf391bfb472d2df4741c6cc7defe871d22`, SHA-256
`bae5440e60cf4a207bf5897715a8fa4ab42785e7a20b3f28813673fde2bbb688`.
Shared cases: Git blob `541c629a6524dec61e4eba1d82c43433f70ee037`.

## Fresh checks actually executed

```sh
node scripts/verify.mjs
NEKON_VAULT_ARGON2_TESTS=1 node scripts/verify-application-event.mjs --http
node scripts/check-package.mjs --types
python3 scripts/check-docs-portal-browser.py --chromium /usr/bin/chromium
python3 scripts/check-developer-workbench-browser.py --chromium /usr/bin/chromium
python3 scripts/check-application-authorization-browser.py --chromium /usr/bin/chromium
python3 scripts/check-transport-http-semantics-browser.py --chromium /usr/bin/chromium
python3 scripts/check-enrollment-storage-browser.py --chromium /usr/bin/chromium
python3 scripts/check-local-vault-browser.py --chromium /usr/bin/chromium
```

- Foundation/root lane: **199/199 passed**, including the new shared-suite
  provenance/registration guard, token drift and token package verification.
- HTTP/Argon2-inclusive installed-client lane: **574/574 passed**, including all
  28 new event cases, 22 native loopback HTTP cases and four optional native
  Argon2 reference cases. **10/10 documentation artifact checks** also passed.
  Distinct root + client + docs total: **783 Node cases**, not a sum of reruns.
- Two actual canonical tarballs installed together offline with scripts disabled:
  **50 allowlisted files**, deterministic builds, strict NodeNext/cross-entry
  consumers, hidden-export checks, both executable examples, and installed/local
  workbench and documentation artifact equality passed. Runtime **157,153 bytes**;
  SDK **16,261 bytes**, within the existing 160 KiB / 48,000-byte budgets.
- The packed token TypeScript consumer passed separately.
- **97 existing synthetic/in-memory Chromium checks passed**: docs 33, workbench
  22, authorization 14, transport HTTP semantics 14, bound storage 14. These are
  not native vault persistence or production KDF checks.
- The final native IndexedDB/WebCrypto command **failed again** at normal loopback
  navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, before any IndexedDB assertion.
  No browser policy, origin, security option or test storage was substituted.

Initial combined root/package invocations exceeded the outer execution session's
wall-time before completion; they are not reported as successful runs. The same
unmodified repository commands subsequently completed separately as listed above.
No repository timeout or verification requirement was relaxed. The 28 focused
cases are already included in 574 and are not counted again.

Environment: Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Playwright 1.57.0,
Chromium 144.0.7559.96, optional argon2-cffi 25.1.0. The Argon2 reference remains
test tooling, not a shipped derivation fallback or the production WASM provider.

## Remaining gates and scope

Real browser persistence, concurrent native CAS, interrupted/reopened operations,
production Argon2/WASM/device integration and the complete browser enrollment
factory remain unverified. The event-driver suite proves settlement under explicit
events, not that those broader integration requirements pass. Private pinned
workspace/Vitest/format/agentic/security and Rust/WASM/MLS/live encrypted-client
checks were not run. No claim of independent review or CI success is made.

The verification tree was reconstructed from the provided archive: all 136 input
hashes were checked; package, test and .github subtrees matched inspected remote
Git trees. This is not a fresh full clone or frozen pnpm installation. GitHub DNS
was unavailable to the execution container and pnpm was absent.

The existing private vault-correction branch was advanced; its main and active
integration branches were not. Toolkit changes stay on #39, not main. No branch
was force-pushed, no broad issue closed, no package published, no service deployed,
no migration performed and no credentials, policies or repository settings changed.
