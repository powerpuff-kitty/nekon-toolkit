# Enrollment integration with main — 2026-09-12

Reconciles PR #37 at `2749f7eb9b7cb48610223f4c22e154173848ce8d` with
main at `f83553c964016d99db8c25b7212e1aced1883f4f`. Both source histories
are retained; this is integration of an unpublished source preview, not deployment.
Related work: #3, #6, #12, #13 and #21.

## Integrated boundary

The coordinator, optional service-bound store, V1 signer-based proof helper,
public export barrels and their source manifests remain unchanged from #37.
Main's latest transport fixes and independent `716be46` source pin are preserved.
There is no new wire format, cryptographic algorithm, credential policy, runtime
dependency, automatic retry or source-ownership cutover in this reconciliation.

The canonical package verifier now runs all existing event, transport, lifecycle,
HTTP-semantics and authorization cases alongside all enrollment, storage and proof
cases. Its opt-in HTTP lane retains all three existing groups. Main's registration
guards are extended, not removed. A new compile-only composition consumer checks
that the actual public transport/resource, coordinator/store and proof types fit
together without private imports or invented production adapters.

README, architecture, security and package guides now describe these available
building blocks and the remaining production-adapter obligations. Historical
extraction documents remain checkpoints, not fresh test results.

## Fresh verification

Commands executed with Node 22.16.0, npm 10.9.2 and TypeScript 5.8.3:

```sh
npm run check
node scripts/verify-application-event.mjs --http
node scripts/check-enrollment.mjs
node scripts/check-package.mjs --types
python3 scripts/check-application-authorization-browser.py --chromium /usr/bin/chromium
python3 scripts/check-transport-http-semantics-browser.py --chromium /usr/bin/chromium
python3 scripts/check-enrollment-storage-browser.py --chromium /usr/bin/chromium
```

- Root check: **133 tests passed**, plus token generation/drift, roadmap and
  extraction metadata and the real token tarball consumer.
- Default canonical client lane: **444 cases passed**. The HTTP-inclusive lane:
  **466 cases passed**, comprising those same 444 plus 22 native HTTP cases.
  Distinct root plus HTTP-inclusive package total: **599 Node tests**.
- The 179 enrollment/storage/proof cases also passed the existing focused runner;
  they are already included in 466 and are not additional independent coverage.
- Both canonical packages were built, packed and installed together in a clean
  offline consumer with lifecycle scripts disabled. **46 allowlisted files**:
  33 runtime, 13 SDK. Strict NodeNext declarations, expected type errors, cross-entry
  composition, hidden-helper rejection, repeat-build equality and both examples pass.
- Final unpacked sizes: runtime **107,183 bytes**, SDK **14,559 bytes**, below #37's
  unchanged 112 KiB / 48,000-byte budgets. No body, record, crypto or release limit
  was relaxed. Packed token types passed separately.
- Three existing Chromium runners passed **14 checks each, 42 total**, using
  emitted modules with in-memory fulfillment and synthetic adapters. Browser:
  Chromium 144.0.7559.96; Playwright 1.57.0. No external requests, page errors or
  browser-policy changes. The storage browser port is deliberately plaintext test
  memory, not browser encryption or IndexedDB. Node fixtures use real AES-GCM/CAS
  and Ed25519, but their persistence, credentials and service behavior are synthetic.
- Complete root and HTTP-inclusive package commands passed final reruns after
  documentation and composition-type changes. Reruns are not added to the totals.

All reused verification inputs were reconstructed from supplied source/archive
and checked against Git object hashes. Every original new root test and behavioral
suite from #37 is retained. This is a hash-verified verification input tree, not a
fresh full Git checkout. A network clone failed because GitHub DNS was unavailable;
pnpm was unavailable, so frozen installation was not run. The documented Node/npm
fallback with the exact compiler did run.

## Explicit limits

V2 local storage remains proposed and explicit opt-in. This source merge neither
approves a default migration nor repairs/adopts old V1 records. Initialization is a
trusted host assertion after actual vault creation. Encryption, KDF, authenticated
metadata, persistence and atomic compare-and-swap remain the host vault's obligation.
The coordinator must be configured with the expected service origin and scope;
raw read() snapshots and proof material must not enter UI, logs or analytics.

Not verified: the production browser factory, LocalSecretVault/IndexedDB/KDF,
Worker/device integration, private full-workspace/security/agentic/Vitest checks,
Rust/WASM/MLS, live approval, production TLS/CORS/cookies, real socket admission or
encrypted two-client interoperability. The browser results do not close those gates.
Signature self-check is not server approval, enrollment is not Room membership,
and local retirement/cancellation is not remote rollback or revocation.

No private repository was modified, no packages were published, no services were
deployed, no workflows/protections were changed, and no secrets were rotated.
Packages remain private/UNLICENSED/publication-gated. Broad SDK, independent-client
and release issues remain open. The separate workbench #35 is not part of this PR.
