# NEKON Toolkit

Public developer tools for building private communication experiences on NEKON.

**Implemented in this foundation:** a dependency-free `@nekon/tokens` source
package, deterministic CSS/JSON/JavaScript/TypeScript generation, local tests,
clean-package verification, an executable roadmap and a Project 14 sync helper.

**Not implemented here yet:** the SDK/runtime extraction, reusable communication
components, hosted console, CLI, developer portal or messenger migration. No
packages have been published. This is not a production-ready communication SDK
or a security audit. Licensing is pending review; see [LICENSE.md](LICENSE.md).

## Develop

Node.js 22 or newer and npm are sufficient for the current dependency-free checks.
The workspace package-manager pin is pnpm 10.18.3; no package installation is
needed for the initial Node-only build and tests.

```sh
node scripts/verify.mjs
# Equivalent package-manager entry point: pnpm check
```

The check builds twice (generation and drift verification), validates the roadmap,
runs the tests, creates a temporary tarball, and installs it offline into an
isolated consumer. It does not deploy or publish anything. With an available
TypeScript compiler, also run `node scripts/check-package.mjs --types`.

## Try the token example

```sh
node packages/tokens/scripts/build.mjs
```

Open `examples/tokens/index.html` in your browser. It uses local generated CSS
and synthetic content only; there is no login, tracking or network SDK. The
[token package guide](packages/tokens/README.md) explains scoped and global usage.

## Architecture and roadmap

[Architecture](ARCHITECTURE.md) · [Roadmap](ROADMAP.md) ·
[Extraction plan](docs/extraction.md) · [Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md) · [Design guidance](DESIGN.md) ·
[Verification checkpoint](docs/verification-2026-09-11.md)

The public toolkit owns reusable client/developer tools. The hosted service,
billing and first-party applications remain in the separate `nekon` repository.
The original messenger has not been migrated by this change.

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
memberships. It does not change statuses, priorities or other existing fields.
Priorities/phases are recorded in issue titles/bodies and `roadmap.json`.
See [Project synchronization](docs/project-sync.md) for limits and error handling.
