# NEKON Toolkit

Public developer tools for building private communication experiences on NEKON.

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

The enrollment entries also have matching runtime subpaths and share one
implementation. The authorization resource is also available through
`@nekon/client-runtime/application-authorization`. Its SDK entry re-exports the
same class and types rather than implementing a second client.

All packages remain unpublished, private and licensing-gated. Transport and
resource sources are staged from pinned upstream candidates, not a production
release. The coordinator, storage binding and proof helper are available, but the
complete browser enrollment factory, production vault/device adapters, full SDK
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
[latest integration checkpoint](docs/enrollment-main-integration-2026-09-12.md)
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
