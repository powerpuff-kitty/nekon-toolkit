# NEKON Toolkit

Public developer tools for building private communication experiences on NEKON.

## Implemented source previews

| Surface | Available here | Important boundary |
| --- | --- | --- |
| `@nekon/tokens` | 91 semantic tokens, scoped themes, CSS/JSON/ESM/types | No network or UI framework |
| `@nekon/sdk/application-event` | Existing canonical custom-event encoding and inspection | Serialization is not encryption |
| `@nekon/client-runtime/application-event` | Shared codec used by the SDK wrapper | No duplicate codec implementation |
| `@nekon/client-runtime/transport` | HTTP/version headers, sessions, bounded responses and WebSocket ticket negotiation | No Room admission, MLS or full SDK client |

All packages remain unpublished, private and licensing-gated. The transport is
staged from an unmerged upstream candidate, not a production-ready release. The
full SDK root, enrollment, encrypted Room owner, Rust/WASM adapters and messenger
migration are still pending. See [licensing](LICENSE.md) and [security](SECURITY.md).

## Local developer workbench

The [developer workbench](examples/developer-workbench/README.md) is a working
no-login event composer and byte inspector. Load synthetic message, telemetry or
command data, encode through the public SDK, inspect canonical hex, and clear
all transient input. It is **not a messaging service or Cloud admin console**:
there is no enrollment, Room admission, E2EE exchange, project provisioning or
message delivery in this example.

After the installed-toolchain setup below, run `pnpm check:workbench` and open
`examples/developer-workbench/dist/index.html`. The generated single HTML file
embeds the existing SDK/codec output and token CSS; it requires no server, CDN,
font download or persistent storage. Network connections are disabled by CSP.
The normal `pnpm check` also runs its build and Node checks after the existing
foundation and installed-package lanes. Optional Chromium UI checks are described
in the example guide. No package publication or deployment is performed.

## Develop and verify

Node 22+, npm, Git and pinned pnpm 10.18.3. TypeScript 5.8.3 is a build-only
dependency for the current public extraction; it does not ship in runtime packages.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` retains the foundation lane and runs the combined extracted-client
package lane. The latter builds from clean output directories, packs both real
packages, installs them offline with lifecycle scripts disabled, checks exports
and strict consumer types, and executes 122 event/transport cases plus the example.
The builder removes partial outputs after compiler failure rather than leaving a
stale package candidate. No command here deploys or publishes anything.

For a pre-provisioned TypeScript 5.8.3 on PATH:

```sh
node --test tests/transport-source.test.mjs
node scripts/verify-application-event.mjs
```

The filename is retained for compatibility; the package lane now verifies both
event and transport subpaths. The latest checkpoint records which checks actually
ran and which full-repository checks remain unverified.

## Browser checks

Python/Playwright are optional contributor tooling, not package dependencies.
Use the pinned `scripts/browser-requirements.txt` and an already installed Chromium.

```sh
node packages/tokens/scripts/build.mjs
python3 scripts/check-browser.py --chromium /path/to/chromium
node scripts/build-application-event.mjs
python3 scripts/check-application-event-browser.py --chromium /path/to/chromium
python3 scripts/check-transport-browser.py --chromium /path/to/chromium
```

The transport gate serves two unchanged emitted ESM modules in memory and uses
synthetic HTTP/socket adapters. It does not navigate to or contact a live NEKON
service. These checks do not establish TLS/CORS/cookie interoperability or a
cross-browser security audit.

## Guides, examples and roadmap

[SDK event guide](packages/sdk/README.md) · [Transport guide](packages/client-runtime/README.md) ·
[Token guide](packages/tokens/README.md) · [Architecture](ARCHITECTURE.md) ·
[Design](DESIGN.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) ·
[Latest extraction checkpoint](docs/transport-extraction.md)

Open `examples/tokens/index.html` after building tokens. The synthetic event
example runs automatically against installed package exports in the package lane.

The hosted service, billing, control plane and first-party messenger remain in
`nekon`. Public source staging does not transfer production ownership. Event and
transport source digests are recorded; reconcile upstream changes before cutover
rather than maintaining divergent implementations. Full dependency review and
real two-client encrypted interoperability remain release gates.

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
