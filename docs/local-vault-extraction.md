# Local vault extraction — 2026-09-12

Source preview for #38, parent #6; related #3, #12 and #21. The existing
`LocalSecretVault`, `IndexedDbVaultStorage` and their contracts are now available
through `@nekon/client-runtime/local-vault` and the identical
`@nekon/sdk/local-vault` re-export. This is the actual vault implementation, not
a replacement encryption fixture or a complete browser enrollment factory.

## Composition and responsibilities

```ts
import { LocalSecretVault, IndexedDbVaultStorage }
  from '@nekon/sdk/local-vault';
import { openBoundApplicationEnrollmentVault }
  from '@nekon/sdk/application-enrollment-storage';

// Host-owned values: approvedDeriveKey, databaseName, binding and assertActive.
// Supply the approved Argon2id provider; this package does not install one.
const vault = new LocalSecretVault({
  storage: new IndexedDbVaultStorage(databaseName),
  deriveKey: approvedDeriveKey,
});
// Create or unlock explicitly according to verified storage/lifecycle state.
// After unlocking an already-bound vault:
const store = await openBoundApplicationEnrollmentVault({
  vault, binding, initializeNewVault: false, assertActive,
});
```

The snippet is composition guidance with required host adapters, not a runnable
login recipe. The vault implements authenticated encryption before storage,
non-extractable in-memory data keys, locked/corrupt/destroyed states, record reads
and writes, authenticated tombstones, bounded atomic batches, secret rewrapping,
and lock-and-drain lifecycle. The IndexedDB adapter implements its existing
persistent-storage contract; other adapters must enforce atomic compare-and-swap
across owners. Interface conformance alone cannot prove atomicity or persistence.

The host must use the existing `argon2id-v1` policy: Argon2id version 19, 65,536 KiB
memory, three iterations, one lane, 16-byte salt and 32-byte output. A callback
returning 32 bytes does not demonstrate that it followed that policy. There is
**no production KDF fallback** in this extraction. The approved browser Rust/WASM
provider and its loading/lifecycle integration remain separate work. Never use
fast test derivations as password protection.

Keep operation arguments immutable until settlement. Read results transfer owned
plaintext arrays to the caller, who must clear them after use. Clearing selected
arrays or dropping key handles cannot guarantee erasure of every engine/provider
copy or JavaScript string. Do not log secrets, plaintext records or raw provider
errors. Local locks and retirement are not server revocation or rollback. Host
pagehide, suspension, explicit lock and cross-context coordination still require
integration; storage traffic is not evidence of trusted user activity.

Enrollment's optional V2 binding envelope remains distinct from the vault's
existing V1 encryption/header format. This change adds no migration, adopts no
old enrollment namespace, and grants no Room membership or message authority.

## Source ownership and packaging

`local-vault-extraction.json` pins the 44,191-byte source to coordinated upstream
candidate `624633e89773b0b75d8656d5b059d2a43bacc535`, blob
`4b6c00090e08872b070cb863ed237e1140dabbf7`. That candidate is unmerged and
undeployed. The toolkit source matches it exactly; the SDK only re-exports the
same classes, policy and types. Other extracted sources and their independent
pins are unchanged. No external runtime dependency or private-key export is added.

The runtime package now contains the additional emitted vault module and its
declarations. Its artifact budget grows from 112 to 160 KiB for that real module;
the SDK budget remains 48,000 bytes. HTTP-body, stored-record, KDF and cryptographic
limits are not changed. Current unpacked sizes are 156,975 runtime bytes and
16,261 SDK bytes, across 50 allowed files. Publication remains blocked.

## Verification

```sh
npm run check
# Requires the separately provisioned scripts/vault-test-requirements.txt tools:
NEKON_VAULT_ARGON2_TESTS=1 node scripts/verify-application-event.mjs --http
# Required browser gate; fails rather than silently skipping when blocked:
python3 scripts/check-local-vault-browser.py --chromium /usr/bin/chromium
```

The complete documented Node check passes 146 root tests and 520 installed-client
cases. The HTTP-inclusive/reference run passes 546 installed-client cases:
520 default, 22 existing native HTTP cases and four optional Argon2 reference
cases. Root plus the most inclusive client run is **692 distinct Node cases**;
repeated runs and subset runs are not additional tests.

The 38 new default vault cases exercise actual `LocalSecretVault` and WebCrypto
AES-GCM with test-only in-memory CAS storage: encryption/reopen, secret changes,
metadata rejection, tombstones, atomic batches, competing writers, lock/drain,
revocation boundaries, non-extractable keys and composition with the existing
bound enrollment store. The fast derivation in these cases is explicitly a test
fixture, not Argon2 or a production provider.

The four optional reference cases use independently installed, pinned
`argon2-cffi==25.1.0` at the policy parameters, through synthetic stdin-only test
inputs. They check policy/determinism, create/unlock/read, rewrapping and NFC
normalization. No Python dependency or subprocess implementation is shipped in
the packages. Passing this lane is not a browser-WASM compatibility result.

The client verifier builds two canonical tarballs, installs them together offline
with lifecycle scripts disabled, checks all existing exports/hidden paths,
strict NodeNext and cross-entry types, deterministic builds, both prior examples
and the unchanged workbench. Six new root checks protect vault provenance,
exports, registration and separation of reference tooling from runtime code.

## Outstanding gates

The four previously merged browser runners were rerun successfully: 22 workbench,
14 authorization, 14 transport HTTP-semantics and 14 enrollment-storage checks
(64 total). These used their existing in-memory HTML/modules and synthetic ports.
Packed token TypeScript consumers also passed. Chromium was 144.0.7559.96.

The native browser runner attempts a normal ephemeral loopback page before
exercising actual IndexedDB/WebCrypto. Navigation is blocked by the environment
with `ERR_BLOCKED_BY_ADMINISTRATOR`; no navigation/security setting is altered.
**No real IndexedDB test pass is claimed.** In-memory browser checks for previously
merged components do not establish that missing result.

Keep this extraction draft pending upstream reconciliation, actual browser
storage, approved Argon2/WASM/device integration and full enrollment-factory
validation. The private pinned workspace/Vitest/agentic/security lanes,
Rust/WASM/MLS and live encrypted two-client journey are not verified here.

Local verification used the supplied reconstructed source subset (114 baseline
file hashes checked) and the documented Node/npm fallback, not a fresh full
checkout. GitHub DNS and pnpm availability prevent a network clone/frozen install.
Executed tools: Node 22.16.0, npm 10.9.2, TypeScript 5.8.3; browser tooling uses
Playwright 1.57.0. No source-consumer cutover, production deployment, publication,
release signing, migration, secret rotation, workflow/protection or Project-field
change is included. Broad SDK and release issues remain open.
