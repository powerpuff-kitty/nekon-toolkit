# Service-bound enrollment storage — source preview

Status: explicit opt-in, unpublished, based on the proposed ADR-0062 V2 local
envelope. No legacy migration, default storage replacement, or production rollout
is included. Related work: toolkit #3, #6, #12 and #21.

## Available API

`@nekon/sdk/application-enrollment-storage` re-exports the exact implementation in
`@nekon/client-runtime/application-enrollment-storage`:

```ts
import {
  openBoundApplicationEnrollmentVault,
  type ApplicationEnrollmentBinding,
  type ApplicationEnrollmentSecretVault,
} from '@nekon/sdk/application-enrollment-storage';
```

The function adapts a trusted secret vault to `ApplicationEnrollmentStore`, ready
for the existing `ApplicationEnrollmentCoordinator`. It is **not** the secret
vault itself. Encryption, authenticated record metadata, key derivation, storage,
and atomic compare-and-swap remain the supplied vault's responsibility.

Bind a dedicated, unlocked enrollment vault before network work. Supply values
from the same configured application and original public device material:

```ts
const store = await openBoundApplicationEnrollmentVault({
  vault: localSecretVault,
  binding: {
    purpose: 'browser-application-enrollment',
    serviceOrigin,
    applicationId,
    redirectUri,
    targetIdentityId,
    targetDeviceId,
    targetSigningKeyHash,
    targetMlsCredentialHash,
  },
  initializeNewVault: vaultWasJustCreated,
  assertActive,
});
// Pass store as the coordinator's vault; retain the same device and activation adapters.
```

These variables are host configuration and already owned adapters, not globals
provided by the toolkit. The production LocalSecretVault/IndexedDB/KDF adapters
and complete browser enrollment factory are not included in this public slice.
Never replace them with an unencrypted localStorage example or synthetic test port.

## What the binding changes

The outer local record retains the service, application, callback, identity,
device and credential hashes independently of the current enrollment draft.
Every operation rechecks that binding. This matters after completion: the older
V1 enrolled receipt by itself contains no service-origin field. With the bound
adapter, changing the service or device is rejected even after the draft has
become `enrolled` or has been retired.

Retirement clears only the draft and advances the revision. It does not remove
the binding, revoke a remote identity/session, or make a used vault a new one.
The coordinator still decides whether retirement is allowed; direct storage
methods do not replace its state-transition authority.

The exact upstream four-state coordinator and its retry material are unchanged.
A lost approval/redemption reply resumes the saved operation. A saved enrolled
receipt recovers local activation failure without another redemption. The new
adapter preserves those semantics with a binding record preceding preparation.

## Host obligations and errors

Set `initializeNewVault: true` only immediately after genuinely creating the
vault. An empty read is not proof of a new vault. This flag is a trusted host
assertion, not a mechanism that independently authenticates creation history.
Existing V1 records are rejected and retained, even with initialization requested.
Tombstones and missing bindings are not automatically adopted or reset.

The secret-vault port must enforce encryption and atomic revision checks across
owners. Returned revision validation cannot make an unsafe backend atomic. Its
read method must transfer an independently owned plaintext byte array; the adapter
clears that array after parsing, including rejection paths. The vault must consume
or copy each write's plaintext before resolving, because the adapter clears its
write buffer in `finally`. JavaScript strings and other copies cannot be reliably
erased by clearing one array.

`application_enrollment_binding_mismatch` means context changed; do not retry
against a different service or discard the record. `binding_missing` or
`binding_legacy_unsupported` requires an explicitly designed migration/recovery
path, not changing the initialization flag. `binding_state_conflict` may reflect
concurrent/stale revisions; retry decisions belong to the coordinator.
`binding_corrupt` retains the stored bytes rather than repairing them silently.
Messages use the full `application_enrollment_` prefix. Vault and lifecycle
adapters can also throw; do not assume every error is safe for logs.

Raw enrollment snapshots and persisted envelopes contain sensitive retry data.
Do not expose them to UI, diagnostics, analytics or support exports. Enrollment
and storage binding grant no Room membership, message access or execution authority.

## Source and packaging

The 10,242-byte adapter is unchanged from the inspected private integration
candidate `3b36676ac162edbe5845848791928a2d5e345d5d`, blob
`0cdf7f1c528b57765e702d1acde77a22837532f3`. Its original 39-case binding suite is
also preserved byte-for-byte. Both are recorded in
`enrollment-storage-extraction.json`.

The parent coordinator, types, and validator remain unchanged. They keep the
existing `enrollment-extraction.json` pin, including the coordinated ES2024 buffer
fix. This is tested composition of those exact inputs, not a claim that the entire
private integration branch was copied, merged, or verified.

Public barrels, the composition fixture/cases, browser harness, and this guide
are new toolkit code. Emitted imports gain only the known `.js` suffixes through
the existing guarded normalizer. Package runtime dependencies remain unchanged.
The package verifier adds the new outputs and tests without removing existing
suites. Its runtime artifact budget rises from 96 to 112 KiB to accommodate the
adapter and declarations; no HTTP, stored-record, cryptographic or release limit
changes. Complete artifact size verification remains a separate pending gate.

## Verification performed in this continuation

```sh
node scripts/check-enrollment.mjs
node --test tests/enrollment-storage-source.test.mjs tests/build-output.test.mjs
# After building emitted modules in a complete workspace:
python3 scripts/check-enrollment-storage-browser.py --chromium /path/to/chromium
```

The focused enrollment runner passes **123 cases**: 60 existing coordinator
cases, 39 unchanged upstream binding cases, and 24 new composition/export cases.
Strict ES2024 compilation and NodeNext consumer declarations also pass. The test
vault uses real AES-GCM/CAS and test-only Ed25519 signing; its proof transcript,
credentials, network and activation are fixtures, not production MLS.

**19 source/build checks** pass, including output cleanup after storage-import
normalization fails. Fake-compiler tests cover orchestration only; they do not
replace the real compiler used by the focused runner.

**14 Chromium checks** pass with the emitted SDK/runtime storage modules. They
use a deliberately plaintext, in-memory test port, not IndexedDB or browser
cryptography. Only four module requests are fulfilled in memory; other network
requests are blocked. No external requests or page errors occurred. Browser
navigation/security policies were not changed.

Environment: Node 22.16.0, TypeScript 5.8.3, Playwright 1.57.0, Chromium
144.0.7559.96. Source files used locally were reconstructed and checked against
Git blob hashes; a full Git clone could not be retrieved in this environment.

**Not run:** complete canonical tarball verification, full repository/foundation
checks, frozen pnpm install, private pinned workspace/security suites, production
vault/IndexedDB/KDF, Rust/WASM/MLS, live approval, or encrypted two-client messaging.
The main package lane is updated, but its registered test count is not presented
as a fresh pass. The focused runner explicitly labels its temporary subpath
harnesses and is not a substitute for canonical packages. No production readiness,
source-ownership cutover, deployment, registry publication, migration or merge is
implied by this checkpoint.
