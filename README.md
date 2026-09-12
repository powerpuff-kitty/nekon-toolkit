# NEKON Toolkit

Public developer tools for building private communication experiences on NEKON.

## Local developer documentation

Run `npm run build:docs` with the pinned toolchain to generate
`docs/portal/dist/index.html` and its machine-readable `api.json`. The portal
includes local search, guides, exact maintained examples, and references generated
from all supported package exports and emitted declarations. It labels execution
contexts, credentials, unpublished packages and incomplete production adapters.
No network, login, hosting or publication is added. See [portal authoring and
verification](docs/portal/README.md). `npm run check:docs` exercises the generator
and the full installed-client check; the default root check retains these gates.

## Local developer workbench

```sh
npm run check:workbench
```

The generated `examples/developer-workbench/dist/index.html` lets you compose
synthetic events and inspect metadata, plaintext and canonical bytes using the
public SDK. It has no login, network backend or browser persistence. Encoding is
not encryption; do not enter real secrets. The command retains all client-package
checks and tests the UI model against installed canonical packages.
See the [workbench guide](examples/developer-workbench/README.md).

## Implemented source previews

| Surface | Available here | Important boundary |
| --- | --- | --- |
| `@nekon/tokens` | 91 semantic tokens, scoped themes, CSS/JSON/ESM/types | No network or UI framework |
| `@nekon/sdk/application-event` | Existing canonical custom-event encoding and inspection | Serialization is not encryption |
| `@nekon/client-runtime/application-event` | Shared codec used by the SDK wrapper | No duplicate codec implementation |
| `@nekon/client-runtime/transport` | HTTP, sessions, bounded responses and WebSocket tickets | No Room admission, MLS or full SDK client |
| `@nekon/sdk/application-authorization` | Prepared authorization-request and redemption API | Same runtime resource; no key generation or complete enrollment flow |
| `@nekon/sdk/application-enrollment` | Resumable four-state coordinator and typed adapter ports | Requires trusted device, encrypted vault and activation adapters |
| `@nekon/sdk/application-enrollment-storage` | Service/device-bound store adapter | Proposed V2 format; explicit opt-in, no automatic migration |
| `@nekon/sdk/application-enrollment-proof` | Existing V1 proof construction and signature self-check | Signer retains private-key ownership; no HTTP or Room authority |
| `@nekon/sdk/local-vault` | Existing encrypted vault and IndexedDB storage source | Approved Argon2id provider required; production browser integration pending |

The enrollment entries also have matching runtime subpaths and share one
implementation. The authorization resource is also available through
`@nekon/client-runtime/application-authorization`. Its SDK entry re-exports the
same class and types rather than implementing a second client.

All packages remain unpublished, private and licensing-gated. Transport and
resource sources are staged from pinned upstream candidates, not a production
release. The coordinator, storage binding and proof helper are available, but the
complete browser enrollment factory, production KDF/device integration, full SDK
root, verified Room owner, Rust/WASM integration and messenger migration remain
pending. A local source merge does not approve a production rollout.
See [licensing](LICENSE.md) and [security](SECURITY.md).

## Develop and verify

Use Node 22+, npm, Git and pinned pnpm 10.18.3. TypeScript 5.8.3 is a build-only
dependency and does not ship in runtime packages.

```sh
pnpm install --frozen-lockfile
pnpm check
# Optional native HTTP integration against the same installed packages:
node scripts/verify-application-event.mjs --http
```

The documented fallback for a pre-provisioned TypeScript 5.8.3 on PATH is:

```sh
npm run check
```

The root check runs all discovered foundation/build/provenance tests, token
artifact checks, and the combined client-package lane. The client lane builds
from clean outputs, packs canonical SDK/runtime tarballs, installs them offline
with lifecycle scripts disabled, checks file/export/dependency boundaries and
strict NodeNext types, and executes both synthetic examples. Its historical
filename is retained for compatibility; it now covers events, transport,
lifecycle, HTTP semantics, application authorization, enrollment, storage and
proofs. `--http` adds original
transport, transport-regression and authorization loopback tests. The default
opens no test servers. Partial artifacts are removed after build failure.

No check deploys or publishes packages. See the
[latest integration checkpoint](docs/local-vault-docs-integration-2026-09-13.md)
for exact results, source-reconstruction details and unrun release gates.

## Browser checks

Python/Playwright are optional contributor tools, not package dependencies.
Use `scripts/browser-requirements.txt` and an already installed Chromium.

```sh
node scripts/build-application-event.mjs
python3 scripts/check-application-authorization-browser.py --chromium /path/to/chromium
python3 scripts/check-transport-http-semantics-browser.py --chromium /path/to/chromium
python3 scripts/check-enrollment-storage-browser.py --chromium /path/to/chromium
```

These checks execute actual emitted modules fulfilled locally with synthetic
Fetch/socket adapters. They do not connect to a live NEKON service or establish
production TLS/CORS/cookie, enrollment or cross-browser security interoperability.
Existing token/event/transport browser runners remain available separately.

## Guides, examples and roadmap

[SDK guide](packages/sdk/README.md) · [Runtime guide](packages/client-runtime/README.md) ·
[Authorization extraction](docs/application-authorization-extraction.md) ·
[Enrollment coordinator](docs/application-enrollment-extraction.md) ·
[Bound storage](docs/application-enrollment-storage.md) ·
[Proof ownership](docs/application-enrollment-proof.md) ·
[Local encrypted vault](docs/local-vault-extraction.md) ·
[Token guide](packages/tokens/README.md) · [Architecture](ARCHITECTURE.md) ·
[Design](DESIGN.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

Open `examples/tokens/index.html` after building tokens. Synthetic event and
authorization examples run automatically against installed package exports.
Never use test zeros, placeholder callbacks or synthetic IDs for real enrollment.
Prepared authorization material must be trusted, immutable and durably owned by
the higher-level enrollment integration. Receipt shape alone proves neither
cryptographic authenticity nor Room authority. Do not log proofs or verifier data.

The hosted service, billing, control plane and first-party messenger remain in
`nekon`. Public source staging does not transfer production ownership. Event,
transport, authorization and enrollment manifests retain independent exact source pins;
reconcile upstream changes rather than maintaining divergent implementations.
Full dependency review and encrypted two-client interoperability remain release gates.

## Project 14

[Roadmap issue #1](https://github.com/powerpuff-kitty/nekon-toolkit/issues/1) indexes
30 work items. Repository issues exist; live Project 14 membership/fields remain
unverified. The helper only changes membership when explicitly run with an
authenticated GitHub CLI authorized for the board:

```sh
node scripts/sync-project.mjs --dry-run
node scripts/sync-project.mjs --apply
```

It preserves existing fields and rejects ambiguous inventories before writes.
See [Project synchronization](docs/project-sync.md). No GitHub Actions are added.

## Local-vault verification status

The local-vault source remains a draft integration. Its two export references and
ownership guide are generated with the rest of the portal; the host-composition
example is type-checked, not executed. Native IndexedDB browser verification is
still blocked at normal page navigation. Passing reference tests is not a browser
storage or production Argon2/WASM result.

With the separately provisioned pinned reference dependency:

```sh
NEKON_VAULT_ARGON2_TESTS=1 node scripts/verify-application-event.mjs --http
python3 scripts/check-local-vault-browser.py --chromium /path/to/chromium
```

The second command is a separate real-browser gate and currently fails in this
execution environment. No navigation-policy workaround or fallback KDF is used.
See [the reconciliation checkpoint](docs/local-vault-docs-integration-2026-09-13.md).
