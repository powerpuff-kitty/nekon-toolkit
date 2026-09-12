# Resumable enrollment coordinator — 2026-09-12

Related: #3, #6, #13 and #21. Based on public candidate
`310eb5d76a031d3df17184e78673158f05030f56` (PR #36).

## Public API

`@nekon/sdk/application-enrollment` and
`@nekon/client-runtime/application-enrollment` expose the same
`ApplicationEnrollmentCoordinator` and typed adapter interfaces. There is one
state implementation, not a new SDK-specific enrollment algorithm.

The existing operations are `begin(scope)`, `acceptCallback({ state, code })`,
`read()`, `resume()` and `retire()`. No browser factory, `lock()` method, private-key
export, Room-admission method or encryption API is invented by this entry point.

The four persisted states remain `prepared`, `approval_required`, `redeeming`
and `enrolled`. Preparation is stored before approval HTTP, callback material is
stored before redemption, and the enrollment receipt is stored before activation.
An ambiguous reply leaves the same request/code/verifier/key material for explicit
resume. A saved enrollment receipt recovers activation/authentication failures
without redeeming again. No automatic background work or retry loop is added.

## Composition with the authorization resource

Supply the real trusted adapters; this snippet deliberately does not offer an
insecure localStorage store or a pretend MLS/key implementation:

```ts
import { ApplicationEnrollmentCoordinator } from '@nekon/sdk/application-enrollment';
import { ApplicationDeviceAuthorizationApiResource } from '@nekon/sdk/application-authorization';
import { NekonTransport } from '@nekon/client-runtime/transport';

// applicationId, serviceOrigin, scope and adapters belong to your configured app.
const owner = new ApplicationEnrollmentCoordinator({
  applicationId,
  authorizationOrigin: serviceOrigin,
  scope,
  transport: new ApplicationDeviceAuthorizationApiResource(
    new NekonTransport(serviceOrigin),
  ),
  vault,       // ApplicationEnrollmentStore: encrypted at rest, atomic CAS.
  device,      // Trusted preparation, proof signing and session authentication.
  activator,   // Idempotent activation of the validated enrolled receipt.
  assertActive,// Host lifecycle/lock guard, checked around asynchronous work.
});
const progress = await owner.begin(scope);
```

Always pin the approved HTTPS authorization origin and expected device/identity
scope in SDK integrations. The optional legacy-compatible fields are not a reason
to accept arbitrary approval origins. The host captures the callback; the owner
checks state/code and resumes the same durable operation. Never expose the raw
`read()` snapshot to UI, analytics or logs: pending records contain verifier and
callback material. Prefer the returned progress object for presentation and still
handle its identifiers/URLs according to the application's privacy policy.

The Store contract is security-relevant, not optional decoration: encrypt records
and implement atomic compare-and-swap across concurrent owners. A checked returned
revision cannot make a non-atomic store atomic. Device adapters own private keys
and actual signing. This coordinator checks material integrity and receipt binding;
it does not replace server proof verification, browser-origin policy or MLS.

`retire()` only removes an already completed local enrollment record. It is not
remote revocation and cannot erase ambiguous pending operations. Local locks or
cancellation do not undo remote writes. The V1 completed receipt has no service
origin; reusing an enrollment vault across different services remains unsupported.
The full browser factory, IndexedDB/Web Locks/Worker/MLS adapters and verified Room
flow are separate unfinished integration work. Successful enrollment is not Room
membership, historical-message access or encrypted messaging interoperability.

## Source ownership and compatibility fix

Three source files match the coordinated upstream candidate
`powerpuff-kitty/nekon@ebad69147676cd905fc5bdb2572af3e42366cba6` (private PR #99,
stacked on #78). The coordinator and types are unchanged from `ef4c73ac`; the
validator has a small upstream ES2024 compatibility fix. A validated ASCII verifier
is encoded into an explicitly allocated Uint8Array so its digest input is an
owned ArrayBuffer. No cast, compiler relaxation, extra untracked byte copy, state
schema or wire-semantic change is used. The existing finally block clears that
same buffer. This upstream candidate is unmerged and undeployed.

`enrollment-extraction.json` records exact source hashes and fixture provenance.
The upstream AES-GCM/CAS and Ed25519 fixture is copied unchanged into tests, not
shipped runtime output. Its transcript/MLS placeholder is test-only; it is not a
production enrollment proof implementation or interoperability vector.

The two public export barrels, normalizer, checks and guide are new toolkit code.
A narrow emitted-import adapter supplies Node ESM `.js` suffixes while preserving
source provenance. Unknown/missing/additional imports fail validation. No runtime
framework, external dependency, browser storage or new crypto protocol is added.

## Verification actually executed

```
node scripts/check-enrollment.mjs
node --test tests/enrollment-build.test.mjs tests/enrollment-source.test.mjs tests/build-output.test.mjs
```

60 focused behavior tests pass against the actual emitted coordinator and both
public entry barrels. They cover all four resume states, exact retry material,
callback and origin/scope validation, encrypted test records, CAS conflicts,
activation failures, proof mutation during hashing, corrupt preparation/records,
lock boundaries and clearing of owned hash inputs. NodeNext declarations pass,
including negative API/type checks. 22 build/provenance/manifest checks pass,
including stale-output cleanup after enrollment normalization failure.

The original source reproduces TS2345 under strict TypeScript 5.8.3 with ES2024
and DOM libraries. The coordinated source compiles strictly under both ES2024
and ES2022, with declaration emission and noEmitOnError. Node is 22.16.0.

The focused runner constructs explicitly labelled temporary module-resolution
harnesses for the new subpaths. It does NOT pack or verify the complete canonical
SDK/runtime tarballs. The main installed-package lane now includes these 60 tests,
additional declarations, explicit artifact/export checks and the prior suites;
that combined lane was authored but NOT executed in this continuation. The runtime
artifact budget is expanded from 64 to 96 KiB for four added emitted modules; no
HTTP, stored-state, cryptographic or release limit is changed. Package-size claims
must await the full package run, not be inferred from the focused harness.

Also not run: full repository/frozen pnpm install, prior suites, original upstream
68-case suite, private pinned compiler/legacy/Vitest/security/agentic checks,
production vault, Rust/WASM or live enrollment. A Chromium secure-context test
could not start because navigation was blocked with ERR_BLOCKED_BY_ADMINISTRATOR;
no browser policy was changed and no new browser pass is claimed.

No main merge, deployment, publication, release signing, secret rotation, Actions
or Project-field mutation. Licensing/private guards remain. Keep broader extraction
and messenger-migration issues open until the complete integration is proven.
