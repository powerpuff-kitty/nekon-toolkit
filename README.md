# NEKON Toolkit

Public developer tools for building private communication experiences on NEKON.

**Implemented:** a dependency-free `@nekon/tokens` source package, deterministic
CSS/JSON/JavaScript/TypeScript generation, package isolation tests, offline browser
regressions, a validated roadmap, a Project 14 sync helper, and a read-only SDK
extraction inventory checker.

**Not implemented here yet:** SDK/runtime extraction, reusable communication
components, hosted console, CLI, developer portal or messenger migration. No
packages have been published. This is not a production-ready communication SDK
or a security audit. Licensing is pending review; see [LICENSE.md](LICENSE.md).

## Develop

Node.js 22 or newer, npm and Git are required for the local checks. The workspace
package-manager pin is pnpm 10.18.3; no dependency installation is needed for the
initial Node-only build and tests. Git is used only in disposable synthetic
extraction-test fixtures, not to download or modify the private platform.

```sh
node scripts/verify.mjs
# Equivalent package-manager entry point: pnpm check
```

The check builds tokens, verifies generated output and roadmap consistency,
validates extraction metadata, runs tests, and installs an allowlisted package
tarball offline into an isolated consumer. It does not deploy or publish anything.
With an available TypeScript compiler, also run:

```sh
node scripts/check-package.mjs --types
```

## Browser regression gate

This is a separate optional development environment; Python and Playwright are
not runtime dependencies of any toolkit package. With Python 3.10 or newer,
install `scripts/browser-requirements.txt` into your own virtual environment and
provide an already installed Chromium:

```sh
python3 -m pip install -r scripts/browser-requirements.txt
python3 scripts/check-browser.py --chromium /path/to/chromium
```

The script does not install a browser, start a server, navigate to URLs or change
browser policies. It renders the real example and generated CSS in memory, in an
offline context, and rejects unexpected network requests. It checks nested themes,
seed overrides, host isolation, responsive layouts and basic keyboard/forced-color
behavior. These smoke checks are not WCAG certification or a cross-browser audit.

## Try the token example

```sh
node packages/tokens/scripts/build.mjs
```

Open `examples/tokens/index.html` in a permitted browser. It uses local generated
CSS and synthetic content only: no login, tracking or network SDK. The
[token guide](packages/tokens/README.md) explains scoped and global usage.

## SDK extraction inventory

```sh
node scripts/check-extraction.mjs --check
node scripts/check-extraction.mjs
# Optional maintainer-only preflight against an authorized local source checkout:
node scripts/check-extraction.mjs --source /path/to/nekon
```

Nine existing SDK/Rust units and 16 source inputs are pinned in
`sdk-extraction-inventory.json`. This is a reviewed declared-dependency map, not a
complete source import graph or permission to publish. The optional source check
compares the exact Git revision and recorded objects, rejects dirty checkouts and
external Git filters, and never copies source or runs source build/test scripts.
The ordinary public build and tests require no access to the private repository.
See [dependency findings and remaining gates](docs/extraction-dependencies.md).

## Architecture and roadmap

[Architecture](ARCHITECTURE.md) · [Roadmap](ROADMAP.md) ·
[Extraction plan](docs/extraction.md) · [Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md) · [Design guidance](DESIGN.md) ·
[Latest verification](docs/continuation-2026-09-11.md)

The public toolkit owns reusable client/developer tools. The hosted service,
billing and first-party applications remain in the separate `nekon` repository.
The original messenger has not been migrated by these changes.

## Project 14

The [roadmap issue](https://github.com/powerpuff-kitty/nekon-toolkit/issues/1)
indexes 30 work items. Their creation is verified; membership in
[Project 14](https://github.com/users/powerpuff-kitty/projects/14) is not.

```sh
node scripts/sync-project.mjs --dry-run
# With an installed, authenticated gh CLI authorized for Project 14:
node scripts/sync-project.mjs --apply
```

The apply command reads the board, adds only missing issues, then verifies all
memberships. It rejects incomplete, unknown, malformed or duplicated content
records before writes. It does not change statuses, priorities or existing fields.
Priorities/phases are recorded in issue titles/bodies and `roadmap.json`.
See [Project synchronization](docs/project-sync.md) for limits and error handling.
