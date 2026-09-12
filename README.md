# NEKON Toolkit

Public developer tools for building private communication experiences on NEKON.

## Implemented source previews

| Surface | Available here | Boundary |
| --- | --- | --- |
| `@nekon/tokens` | 91 semantic tokens, scoped themes, CSS/JSON/ESM/types | No network or framework |
| `@nekon/sdk/application-event` | Existing canonical custom-event encoding and inspection | Serialization is not encryption |
| `@nekon/client-runtime/transport` | HTTP, sessions, bounded responses and WebSocket tickets | No verified Room admission or MLS |
| `@nekon/sdk/application-authorization` | Existing prepared-request/redemption API | No key generation or durable enrollment ownership |
| `@nekon/sdk/application-enrollment` | Existing resumable four-state coordinator and typed ports | Concrete encrypted store/device/activation adapters are required |
| `@nekon/sdk/application-enrollment-storage` | Opt-in service/device-bound store adapter | Proposed V2 envelope; host vault owns encryption and CAS |
| `@nekon/sdk/application-enrollment-proof` | Existing V1 proof construction and signature self-check | Trusted signer retains private-key ownership; no HTTP or Room admission |

The SDK entries use the same implementations exposed by their corresponding
runtime subpaths. Packages are private, unpublished and licensing-gated. Sources
are staged from coordinated unmerged upstream candidates, not production releases.
The full SDK root, browser/MLS factory, verified Room owner and first-party
messenger migration remain pending. See [licensing](LICENSE.md) and
[security](SECURITY.md).

## Develop and verify

Use Node 22+, npm, Git, pinned pnpm 10.18.3 and TypeScript 5.8.3 (build-only):

```sh
pnpm install --frozen-lockfile
pnpm check
```

The default check retains the foundation and combined installed-client package
lanes. Packages are built from clean output directories, packed, installed offline
with lifecycle scripts disabled, and checked for explicit exports, contents and
strict consumer types. Partial outputs are removed after compiler or import
normalization failure. The client lane includes event, transport, authorization
and enrollment tests; no command deploys or publishes a package.

A focused enrollment check, using a pre-provisioned TypeScript 5.8.3 when needed:

```sh
node scripts/check-enrollment.mjs
```

This compiles the real new sources and public export barrels into a temporary
module-resolution harness. It is not a substitute for the full installed-tarball
or repository checks. The [latest checkpoint](docs/application-enrollment-proof.md)
clearly distinguishes checks actually run from those still pending.

## Guides and examples

[Enrollment proof](docs/application-enrollment-proof.md) ·
[Enrollment storage](docs/application-enrollment-storage.md) ·
[Enrollment coordinator](docs/application-enrollment-extraction.md) ·
[SDK guide](packages/sdk/README.md) · [Runtime guide](packages/client-runtime/README.md) ·
[Authorization extraction](docs/application-authorization-extraction.md) ·
[Tokens](packages/tokens/README.md) · [Architecture](ARCHITECTURE.md) ·
[Design](DESIGN.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

Open `examples/tokens/index.html` after building tokens. Synthetic event and
authorization examples run in the combined installed-package verification lane.
Enrollment tests use a real encrypted test store and test-only signing, not a
production vault, key adapter or live approval flow. Do not copy test secrets or
placeholder adapters into a real application. Raw enrollment snapshots are
sensitive and must not enter UI, logs or analytics.

Python/Playwright browser checks are optional contributor tooling, not package
runtime dependencies. Use `scripts/browser-requirements.txt` and an installed
Chromium; existing browser commands and limitations are recorded in the relevant
checkpoint documents. Browser tests using synthetic adapters do not establish
production TLS/CORS/cookie or encrypted-client interoperability.

The hosted service, billing, control plane and first-party messenger remain in
`nekon`. Staging is not source-ownership cutover. Exact source manifests record
upstream provenance; reconcile changes rather than maintaining a runtime fork.

## Project 14

[Roadmap issue #1](https://github.com/powerpuff-kitty/nekon-toolkit/issues/1) indexes
the work items. Repository issues exist; live Project membership/fields remain
unverified. With an authenticated GitHub CLI authorized for the board:

```sh
node scripts/sync-project.mjs --dry-run
node scripts/sync-project.mjs --apply
```

The helper preserves existing fields and rejects ambiguous inventories before
writes. See [Project synchronization](docs/project-sync.md). No Actions are added.
