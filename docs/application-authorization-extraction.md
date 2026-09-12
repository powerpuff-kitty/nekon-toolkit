# Application-authorization extraction — 2026-09-12

Related: #3 (dependency/source ownership), #6 (existing SDK extraction),
#13 (developer documentation), #21 (packaged verification). Based on transport
candidate `a97a1cf3b98d255de975528bd911e7d9e049b8ed`. The workbench branch is separate.

## Delivered boundary

`@nekon/client-runtime/application-authorization` now exposes the existing
`ApplicationDeviceAuthorizationApiResource`. The new
`@nekon/sdk/application-authorization` entry re-exports that exact class and its
interfaces, rather than implementing another client. Existing method names and
wire routes are unchanged: create an application authorization request and redeem
already prepared authorization material.

Four source files are byte-identical to the upstream candidate
`powerpuff-kitty/nekon@39c8e2b268e1ee0fd7bf69f21827e1aa0a1dc186`:

| File under packages/client-runtime/src | Upstream Git blob |
| --- | --- |
| application-device-authorization-api-resource.ts | ff71119ed44655190f1ef1fea857d248d44edbec |
| client-binary-codec.ts | b3a0f42118f92a1bc6c39d53dd2e5f8ef6144fc4 |
| client-api-error.ts | e5c4d17684eceac5cdcbd905f4acf939538abe4f |
| client-response-validation.ts | f56985a5ec5d7b061b3e7f105bcb5393c40ddc41 |

The resource's blob also matches active enrollment candidate `ef4c73ac`.
This is a check of that resource, not a claim that the full enrollment branch was
merged or audited. Its dependencies close over these three shared helpers plus
the previously extracted transport contract. No external runtime, Rust/WASM,
framework, DOM or storage dependency is added. Shared helpers remain private
implementation paths; no package subpaths expose them.

`authorization-extraction.json` records exact byte counts, Git objects and SHA-256
hashes. The SDK re-export, packaging, tests and build adapter are newly authored;
they are not described as unchanged upstream files. The private source and its
production consumer are not modified by this extraction.

## Build and packaging

The original TypeScript uses extensionless relative imports. A deliberately
narrow adapter normalizes only the known emitted import prefixes to `.js` after
compilation. It accepts the pinned compiler's known form/order, leaves body text
unchanged, rejects unexpected module dependencies, and handles declarations too.
It is not an arbitrary-JavaScript rewriting service. Source-equivalence checks,
negative build tests and actual NodeNext consumers complement this restriction.

Both output directories are cleared before compilation and after compiler or
normalization failure. New tests retain wrong-version/compiler-failure coverage
and add normalization failure and SDK-compilation failure after runtime success.
The orchestration fixture is explicitly a fake compiler; real TypeScript runs in
the separate packaged-consumer lane.

The actual tarballs contain 19 runtime files and 7 SDK files. Measured unpacked
sizes in this checkpoint: runtime **55,908 bytes**, SDK **10,300 bytes**, including
guides and declarations. The runtime artifact budget rises from the previous
transport-only slice to 64 KiB to account for four real new modules; the SDK's
48,000-byte budget stays unchanged. No HTTP-response byte limit, credential check,
release restriction or test threshold is relaxed.

## Fresh verification

```
node scripts/verify-application-event.mjs --http
node --test tests/application-authorization-source.test.mjs tests/authorization-build.test.mjs tests/build-output.test.mjs
python3 scripts/check-application-authorization-browser.py --chromium /path/to/chromium
```

- **243 installed-package cases passed:** all 155 prior event/transport/lifecycle
  cases, 84 new authorization cases and 4 opt-in native HTTP authorization cases.
  Without `--http`, the same runner executes 239 cases without opening a port.
- Two real tarballs were installed together offline into a fresh temporary
  consumer, with lifecycle scripts disabled and isolated npm configuration.
  All 26 files were checked against an explicit allowlist, exports/dependencies
  were checked, and private helper imports were rejected.
- Strict TypeScript/NodeNext consumer checks passed for all three client surfaces,
  including expected failures for unsupported methods and wrong material types.
  Repeat builds matched; both actual synthetic examples executed.
- **18 build/provenance cases passed:** 5 source checks, 8 import-normalization
  checks and 5 output-cleanup orchestration cases.
- **14 Chromium checks passed:** emitted SDK/runtime imports, both operations,
  credential separation, exact material submission, receipt rejection, error
  handling and no automatic replay. Only seven emitted modules were fulfilled
  in memory; there were no external requests or page errors.
- Native HTTP tests used real fetch and ephemeral 127.0.0.1 servers for both
  request bodies, session-header omission, rejected redirects, error handling,
  request correlation and absence of automatic retries. Every server was closed.

Toolchain: Node 22.16.0, npm 10.9.2, available TypeScript 5.8.3, Chromium
144.0.7559.96, Playwright 1.57.0. No new dependency was introduced.

Execution used a reconstructed source subset with reused executable inputs
checked against fetched Git blob IDs, not a fresh Git checkout. The complete
client packaged-consumer lane above was run; the full repository `pnpm check`,
foundation/token/workbench checks, frozen pnpm installation, earlier browser
suites, upstream pinned workspace/Vitest/security/agentic and Rust/WASM/MLS tests
were not run. This checkpoint does not substitute historical pass counts for
fresh results or claim complete repository verification.

## What this does not establish

The resource requires trusted, immutable, already prepared enrollment inputs.
It validates shapes and selected correlation fields, not signatures, PKCE binding,
service-origin trust, receipt freshness or expected identity ownership. The
higher-level encrypted enrollment owner must generate/persist/bind material,
validate its expected origins and identities, handle callbacks and resume safely.
The resource never navigates to the returned URL or installs enrollment/session
state. The guides document these distinctions instead of expanding its authority.

Mock and loopback receipts do not enroll a real device. These checks establish
neither production CORS/cookies/TLS nor a real approval flow, MLS state, verified
Room admission, message encryption or two-client interoperability. The full SDK
root and browser enrollment coordinator remain unavailable in this toolkit.

Packages remain private, UNLICENSED and unpublished. No source-ownership cutover,
main merge, deployment, release signing, credentials, Actions or Project fields
were changed. Keep the broad extraction and messenger-migration issues open.
