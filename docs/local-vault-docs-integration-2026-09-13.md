# Local-vault and documentation reconciliation — 2026-09-13

Continues draft #39 and issue #38; related #6, #13 and #21. Reconciles vault
candidate `77f991f3348ae39a9e1ff6620af7af79c4a1980b` with documentation main
`fdfca463f2c8ce14367ba283b180fa455bdb0c8f`. Both histories are retained.

## Implementation

The vault/runtime and SDK source are unchanged. Complete runtime and SDK package
source trees match the inspected #39 trees, including manifests and guides. The
existing upstream pin, V1 encryption/KDF/record policy, optional V2 binding and
all earlier transport, authorization, enrollment and workbench cases remain.
No cryptographic fallback, default derivation, dependency or larger limit is added.

The portal now documents both local-vault subpaths: 11 guides plus 17 generated
reference pages (28 pages, 120 declaration entries including shared re-exports).
A local-vault ownership guide separates fast state-machine fixtures, the optional
native Argon2 reference, and native browser storage. Four selected vault errors
are checked against emitted implementation literals. This is not a complete error
taxonomy or production recovery implementation.

A maintained compile-only vault/enrollment composition example joins the previous
enrollment type example; both executable examples remain unchanged. The package
gate type-checks its installed consumer and embeds exactly the same source in docs.
References still come from actual export maps and TypeScript declarations.

The combined verifier retains the docs HTML/JSON equality checks, all existing
client suites, 38 vault cases, four optional Argon2 cases and 22 native HTTP cases.
Invalid Argon2 selection values now fail before build, rather than silently
omitting the reference lane. New guards cover docs registration, host composition
and retention of the separate normal-navigation IndexedDB gate.

## Fresh verification

- `npm run check`: 198 root tests, 520 default installed-client cases and 10 docs
  artifact cases passed. Full root check was rerun after integration changes.
- `NEKON_VAULT_ARGON2_TESTS=1 node scripts/verify-application-event.mjs --http`:
  546 installed-client cases and 10 docs cases passed. The 546 comprise the same
  520 plus 22 native HTTP and four native Argon2 reference cases. Across root,
  this client lane and docs, there are 754 distinct Node cases, not the sum of
  overlapping reruns.
- Two canonical tarballs were installed together offline, lifecycle scripts
  disabled: 50 allowlisted files, strict NodeNext/cross-entry types, deterministic
  builds, private-export guards, both executable examples and byte-identical
  installed/local documentation artifacts passed. Unpacked sizes remain exactly
  #39's 156,975-byte runtime and 16,261-byte SDK, within its existing budgets.
- The token package TypeScript consumer passed separately.
- Documentation browser runner: 33 checks passed, including the new vault guide,
  compile-only labeling, search and generated contracts. Existing workbench (22),
  authorization (14), transport semantics (14) and bound-storage (14) checks passed:
  97 total in-memory/synthetic browser checks. Desktop screenshot inspected.
- The separate unchanged native IndexedDB/WebCrypto runner was actually attempted
  and FAILED at normal loopback navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`.
  No IndexedDB assertions ran; no policy was changed or substituted. This failure
  is separate from and not hidden in the 97 passing synthetic browser checks.

Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Playwright 1.57.0, Chromium
144.0.7559.96 and optional argon2-cffi 25.1.0. No new runtime dependency.

## Reproduction

```sh
npm run check
NEKON_VAULT_ARGON2_TESTS=1 node scripts/verify-application-event.mjs --http
node scripts/check-package.mjs --types
python3 scripts/check-docs-portal-browser.py --chromium /path/to/chromium
python3 scripts/check-local-vault-browser.py --chromium /path/to/chromium
```

The final command is a separate failing gate in this environment. Do not replace
it with an in-memory port or treat it as a skip. The Argon2 lane requires the
separately provisioned pinned reference package; it is not the browser WASM KDF.

## Limits and decision

Keep #39 draft and #38 open. Real IndexedDB persistence/concurrency, production
Argon2/WASM/device integration and the full browser enrollment factory remain
unverified. Local cryptographic fixtures are not those integration checks. Private
workspace/security suites, Rust/WASM/MLS and live encrypted-client interoperability
were not run. This continuation does not approve source cutover or a V2 migration.

A network clone failed with unavailable GitHub DNS. Execution used a reconstructed
verification tree: all 123 supplied main inputs were hash-checked; the entire
runtime/SDK/tokens source trees match the inspected PR, and fetched vault source,
fixtures and browser runner match their Git blobs. This is not a fresh full Git
checkout, frozen pnpm installation, independent audit or signed release evidence.
No packages were published, services deployed, private repositories changed,
secrets rotated, workflows/protections modified or Project fields changed.
