# IndexedDB connection lifecycle — 2026-09-13

Continues toolkit #38 / #39 and the coordinated private vault correction.
Toolkit parent: `cde1c42440c468757192620ae31eee59bae73816`.
Upstream source commit: `c4f72babf0b8c84854c3185ceeed717c8bf1303d`.
Both PRs remain draft. Native browser persistence is still an unpassed gate.

## Correction

The adapter previously retained a rejected open Promise indefinitely, and retained
a connection after its versionchange handler closed it. A blocked open could also
finish later with a connection that had no successful caller to own or close it.
The new connection manager stays inside the existing IndexedDbVaultStorage owner:

- Terminal open failures are evicted; only a later explicit operation can reopen.
- Versionchange closes and evicts the connection. Unexpected close evicts it too.
- Concurrent callers share the current attempt. A still-blocked attempt remains
  cached as a rejection until its native request finishes, preventing retry queues.
- A late connection after blocked rejection is closed without publication. An
  abandoned upgrade is aborted before object stores are created.
- Every eviction checks the exact attempt identity. Old connection callbacks do
  not invalidate newer connections. Synchronous open exceptions use the existing
  bounded vault_storage_open_failed diagnostic.

Database version stays at 1. No operation is automatically replayed, no vault key
is recreated, and no encryption, KDF, record, CAS, locking or publication policy is
changed. Reopening does not restore deleted data or establish vault authority.
The existing abort-settlement and requested-record binding corrections remain.

The behavior follows the Indexed Database API 3.0 draft's database-connection and
open/close algorithms. A blocked event precedes waiting for old connections; it
is not terminal request cancellation. Closed connections reject new transactions.
Explicit close does not fire the abnormal-close event. Reference:
https://w3c.github.io/IndexedDB/#opening
https://w3c.github.io/IndexedDB/#closing-connection
This reference is not evidence that the native-browser gate has passed.

## Regression and native coverage

The same 21 manual connection-event tests pass 10 / fail 11 against the original
compiled module, and pass 21 / fail 0 with the correction. They execute the real
adapter through an injected event driver, not an IndexedDB engine. Tests cover
shared opens, terminal and synchronous failures, blocked-to-terminal ordering,
late cleanup, stale callbacks, current upgrades, version pinning and no read replay.
They are registered in the existing installed-vault consumer and shared unchanged
with the private source. The private Vitest adapter is authored but not executed.

The native IndexedDB runner now also authors four checks in a separate disposable
namespace: first-open emptiness, actual versionchange/VersionError, retry after
terminal error and deletion, and same-adapter reopen after native deletion.
All original native assertions and normal-navigation checks remain. The new browser
expression parses successfully, but none of these assertions ran: page.goto is
still blocked with ERR_BLOCKED_BY_ADMINISTRATOR. No fake storage or navigation
policy substitution was made.

## Fresh execution

- `node scripts/verify.mjs`: 200 root tests passed, plus token generation/drift,
  roadmap/extraction metadata and actual token tarball verification.
- `NEKON_VAULT_ARGON2_TESTS=1 node scripts/verify-application-event.mjs --http`:
  595 installed-client tests and 10 docs-artifact tests passed. These include the
  21 new cases, earlier 28 abort cases, 22 native HTTP cases and four optional
  Argon2 reference cases. Root + clients + docs = 805 distinct Node tests.
- Both canonical tarballs installed offline with lifecycle scripts disabled:
  50 allowlisted files. Runtime 158,876 bytes; SDK 16,261 bytes, within unchanged
  160 KiB / 48,000-byte budgets. Strict NodeNext and composition types, examples,
  hidden-export guards, deterministic builds, workbench and docs equality passed.
- `node scripts/check-package.mjs --types`: packed token consumer passed.
- Existing synthetic/in-memory Chromium checks: 33 docs, 22 workbench,
  14 authorization, 14 transport semantics and 14 bound-storage; 97 passed total.
- `python3 scripts/check-local-vault-browser.py --chromium /usr/bin/chromium`:
  failed before IndexedDB assertions, with default navigation policies unchanged.

One initial combined root/package invocation exceeded the outer execution limit.
Its completed root results are retained; the unfinished package run is not counted
as a pass. The exact unmodified package command subsequently completed separately.
Repository timeouts, test selection, budgets and guards were not relaxed.

Environment: Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Playwright 1.57.0,
Chromium 144.0.7559.96, optional argon2-cffi 25.1.0. Python Argon2 is reference
test tooling, not a shipped runtime KDF or production browser provider.
The provided verification archive's 138 input hashes were checked before edits.
This is a reconstructed verification tree, not a fresh full clone or frozen pnpm
installation. No prior test counts are represented as fresh results.

## Remaining gates

Keep #38 and #39 open. Native browser persistence, concurrent CAS, reopen/recovery,
production Argon2/WASM/device integration and the full browser enrollment factory
remain unverified. Private pinned Vitest/workspace/format/agentic/security lanes,
Rust/WASM/MLS and live encrypted-client interoperability were not run. No main
merge, deployment, publication, migration, source-consumer cutover, secret access,
workflow/protection change or Project-field update is authorized by this checkpoint.
