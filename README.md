# NEKON Toolkit

Public developer tools for building private communication experiences on NEKON.

## Implemented source previews

**Design foundations:** `@nekon/tokens`, with 91 existing semantic variables,
scoped light/dark CSS, JSON/ESM/type exports, package checks and browser regressions.

**First SDK slice:** `@nekon/sdk/application-event`, backed by the unchanged
`@nekon/client-runtime/application-event` codec. Encode/inspect structured custom
events with optional reply/thread/replace/reaction relations. This slice has no
WASM, Vue, network or DOM dependency. Its bytes are **not encrypted**.

The full SDK root, network transport, enrollment, Room controllers and Rust/WASM
adapters have not been extracted. There is no public messenger migration yet.
These packages are unpublished, private and licensing-gated. This is neither a
production-ready communication SDK nor a security audit; see [LICENSE.md](LICENSE.md).

## Develop

Use Node.js 22+, npm, Git and the pinned pnpm 10.18.3. TypeScript 5.8.3 is a
build-only dependency for this extraction slice; it does not ship with the SDK.

```sh
pnpm install --frozen-lockfile
pnpm check
```

The event builder prefers the locally installed compiler. An already provisioned
TypeScript 5.8.3 on PATH is supported for the documented Node/npm fallback:

```sh
node --test tests/application-event-source.test.mjs
node scripts/verify-application-event.mjs
```

The new lane checks identical-build output, packs both real packages, installs
them into an isolated offline consumer, runs 63 consumer tests and strict
TypeScript checks, and executes a synthetic example. It never publishes or
connects to NEKON. `node scripts/verify.mjs` remains the foundation-only lane;
`pnpm check` runs both lanes. See the [SDK package guide](packages/sdk/README.md).

## Browser checks

Python 3.10+ and Playwright are optional contributor tools, not package runtime
dependencies. With the pinned `scripts/browser-requirements.txt` installed and an
already available Chromium executable:

```sh
node packages/tokens/scripts/build.mjs
python3 scripts/check-browser.py --chromium /path/to/chromium
node scripts/build-application-event.mjs
python3 scripts/check-application-event-browser.py --chromium /path/to/chromium
```

Both gates use offline in-memory pages, not URL navigation or browser-policy
changes. Token checks cover themes and basic UI behavior. Event checks execute
the actual emitted ESM modules through a browser import map, including the pinned
upstream vector and buffer ownership. Neither is a complete cross-browser audit.

## Examples and architecture

Open `examples/tokens/index.html` after the token build in a permitted browser.
The synthetic `examples/application-event/example.mjs` is executed automatically
against the isolated package installation by the event verification lane.

[Architecture](ARCHITECTURE.md) · [Design guidance](DESIGN.md) ·
[Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) ·
[SDK extraction checkpoint](docs/application-event-extraction.md)

The hosted service, billing, control-plane application and first-party messenger
remain in the separate `nekon` repository. Staged source copies remain unchanged
until a coordinated ownership cutover; no competing SDK or crypto implementation
is being created. The existing [declared dependency inventory](docs/extraction-dependencies.md)
remains incomplete for the full SDK. This first two-file codec closure is complete
at the source/build level, not a substitute for the full SDK or live network tests.

## Project 14

[Roadmap issue #1](https://github.com/powerpuff-kitty/nekon-toolkit/issues/1)
indexes 30 work items. Their creation is verified; membership in
[Project 14](https://github.com/users/powerpuff-kitty/projects/14) is still unverified.

```sh
node scripts/sync-project.mjs --dry-run
# Only with an authenticated gh CLI authorized for Project 14:
node scripts/sync-project.mjs --apply
```

The helper adds missing issues and verifies membership without changing existing
fields. It rejects malformed/ambiguous inventories before writes. See
[Project synchronization](docs/project-sync.md) for its limits.
