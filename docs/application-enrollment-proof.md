# V1 enrollment proof builder — extraction preview

The SDK now exposes `@nekon/sdk/application-enrollment-proof`, backed by the exact
function in `@nekon/client-runtime/application-enrollment-proof`. Both provide
`createEnterpriseAuthorizationRedemptionWithSigner` and its input/result types.
This is the existing V1 proof implementation, not a new protocol or a signing-key
store. Packages remain private, unpublished and licensing-gated.

## How it fits

The enrollment coordinator persists the callback and original verifier before
asking its trusted device adapter to prepare a redemption. That adapter can now
call the real proof builder through supported public exports:

```ts
import { createEnterpriseAuthorizationRedemptionWithSigner }
  from '@nekon/sdk/application-enrollment-proof';

// These values are owned by your trusted enrollment device adapter, not globals
// provided by the SDK. Preserve the exact pending state across ambiguous replies.
const proof = await createEnterpriseAuthorizationRedemptionWithSigner({
  applicationId,
  authorizationRequestId,
  targetDeviceId,
  code: authorizationCodeBytes,
  codeVerifier,
  targetSigningPublicKey,
  targetMlsCredential,
  sign: signOwnedTranscript,
  signal,
});
```

The helper snapshots its input, hashes the code/verifier/public credentials,
constructs the existing domain-separated V1 transcript, asks the supplied signer
for its signature, and verifies that signature against an independent copy of
the intended transcript and supplied public key. It returns an immutable encoded
proof. No private-key parameter is accepted: key ownership stays with the trusted
signer. The browser facade/Worker adapter that supplies that signer is separate.

The caller must first validate callback state and persist the exact enrollment
material. This helper performs no HTTP, approval, storage, session activation or
Room admission. A valid local signature is not proof that the service approved
the code, accepted the enrollment, or granted Room membership. Opaque credentials
are bounded bytes here, not a claim of valid OpenMLS state. Existing service and
coordinator checks remain required.

## Ownership, failures and cancellation

`sign` receives an owned transcript copy and must return an owned 64-byte Ed25519
signature. Do not return a buffer still owned by another subsystem. The helper
clears its owned arrays and the returned signature array on completion/failure;
it does not erase callers' original buffers, string values, or every copy a
provider may retain. Never log proof/code/verifier values or raw provider errors.
The injected crypto provider and signer are trusted local components.

Invalid input, wrong signatures and observed cancellation reject. No automatic
retry occurs. A provider failure can propagate as its original error; the owning
integration must normalize diagnostics without including sensitive content.
Cancellation is checked around asynchronous boundaries, but cannot force an
arbitrary signer/provider that never settles to complete. It is not remote
rollback or revocation. The coordinator, not this helper, owns explicit recovery
using the same durable pending material.

## Verification and source

The 6,349-byte runtime file is byte-identical to the inspected upstream integration
candidate `d984b2fc1980f9d458988de3a1437581e25be234`, blob
`8721f0968ef03a83c907ea5cb2c18f28934a5657`. The source has no imports or third-party
runtime dependencies. Its source pin and SHA-256 are in
`enrollment-proof-extraction.json`. Existing coordinator, validation and bound
storage sources are unchanged. There is no private-repository modification or
source-ownership cutover in this increment.

The existing storage composition fixture now invokes this production proof
builder rather than signing a test-only transcript. Its simulated service builds
its expected V1 transcript independently. AES-GCM/CAS storage, device keys,
network and activation remain fixtures; neither real IndexedDB nor a live
service is exercised. The direct proof suite also uses Node's independent
Ed25519 signing/verification API alongside the builder's native Web Crypto
self-check. This is stronger regression evidence, not a security audit.

Fresh commands run on Node 22.16.0 / TypeScript 5.8.3:

```sh
node scripts/check-enrollment.mjs --proof-only
node --test tests/enrollment-proof-source.test.mjs
```

The explicit focused mode passed **119 cases**: 56 new proof tests, 39 unchanged
upstream binding cases, and 24 existing storage composition/export cases now
using actual V1 proof bytes. Strict ES2024 compilation and NodeNext declarations
passed. The source/manifest/test-registration suite passed **9 cases**. Repeated
runs are repetitions of these counts, not additional independent tests.

The default `check-enrollment.mjs` still includes the earlier coordinator suite;
`--proof-only` explicitly selects the documented subset. The full installed-client
package verifier retains all old suites and now registers proof tests, types,
module artifacts and exports. Existing package-size budgets and release guards
are unchanged.

**Not run at this revision:** that full installed-package lane, the default
all-enrollment suite, root/foundation checks, frozen pnpm installation, earlier
browser suites, upstream full-workspace/security gates, production vault/KDF/
Worker/MLS or live enrollment. Full checkout retrieval was unavailable because
GitHub DNS failed in the execution environment; local inputs were reconstructed
and checked against exact Git blobs. The focused runner uses temporary selected-
subpath manifests, not canonical complete tarballs. No browser pass, release,
merge, deployment, migration or production readiness is claimed here.
