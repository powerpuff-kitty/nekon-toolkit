# Local-vault destruction lifecycle — 2026-09-14

Continues toolkit #38/#39 and coordinated private correction #102.
Toolkit parent: `d8b3b17deefac6e0402ccf2e75b822d597f0512a`.
Upstream source: `b184708ae9a810ee76cb37912cd8fc7d9ed0f903`.
Keep both PRs draft: the native IndexedDB gate has not passed.

## Contract

A LocalSecretVault instance now owns one pending destruction operation across
revocation, operation drainage and storage clearing. Concurrent destroy callers
share its success or failure. Create and unlock transitions on that instance are
rejected with the existing vault_locked error while destruction is pending, before
key derivation starts. Lock, suspend or a separate lockAndDrain call cannot reopen
transition admission before the deletion attempt settles.

Success retains the existing terminal destroyed state. Failure retains locked or
corrupt state and allows only explicit recovery; it does not retry deletion or
recreate keys. A failed clear may have committed before its acknowledgement was
lost, so failure is not proof that data remains. Earlier dispatched operations
still drain before clearing and keep their existing commit/error semantics.

This is per-instance lifecycle serialization, not a cross-tab storage lock, a
remote revocation mechanism or a guarantee of erasure of browser-managed copies.
The storage adapter, database version, public state union, key derivation policy,
cryptography, record format and compare-and-swap rules are unchanged.

## Verification

The 13 new shared lifecycle cases use the actual vault and native AES-GCM with
controlled in-memory storage and a fast TEST-ONLY derivation. They are not native
IndexedDB evidence or a production password KDF. On the prior emitted source,
four passed and nine failed. All 13 pass on the corrected source. The private
Vitest adapter is included but has not been executed in its private workspace.

Commands completed in this continuation:

```sh
node scripts/verify.mjs
NEKON_VAULT_ARGON2_TESTS=1 node scripts/verify-application-event.mjs --http
node scripts/check-package.mjs --types
```

The root lane passes 201 cases. The canonical installed-client lane passes 608
cases, including the 13 new cases, all prior 28 abort and 21 connection tests,
22 native HTTP tests and four optional Argon2 reference tests. The documentation
lane passes 10 cases: 819 distinct Node tests, without counting repeated runs.
Two actual SDK/runtime tarballs are installed offline with lifecycle scripts
disabled; all 50 allowed files, strict NodeNext/cross-entry consumers, examples,
deterministic builds and installed/local docs/workbench artifact equality pass.
Unpacked sizes: runtime 159,611 bytes; SDK 16,261 bytes. Limits are unchanged.

Five existing synthetic/in-memory Chromium runners pass 97 checks: documentation
33, workbench 22, authorization 14, transport HTTP semantics 14 and bound storage
14. The unchanged native vault runner was attempted on the corrected build and
failed before assertions with ERR_BLOCKED_BY_ADMINISTRATOR at normal loopback
navigation. No navigation policy or storage implementation was substituted.

Environment: Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Playwright 1.57.0,
Chromium 144.0.7559.96, optional argon2-cffi 25.1.0. Python is reference test tooling,
not a runtime or production WASM provider.

## Limits

Execution used the supplied reconstructed source, not a fresh Git checkout.
Baseline package, test and .github subtrees match the inspected live Git trees;
source pins and changed-file hashes were verified. GitHub DNS is unavailable in
the execution container, and a frozen pnpm installation was not performed.
Private workspace/Vitest/format/agentic/security lanes, real IndexedDB persistence
and cross-tab coordination, production Argon2/WASM/device integration, and live
Rust/WASM/MLS encrypted-client interoperability remain unverified.

Only disposable test data was destroyed. No production deletion, main/integration
merge, source-consumer cutover, package publication, deployment, migration,
workflow/protection change, secret access or Project-field mutation is included.
