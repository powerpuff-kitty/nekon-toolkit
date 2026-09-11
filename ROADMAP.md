# NEKON Toolkit roadmap

Generated from `roadmap.json`; edit the JSON and run `node scripts/roadmap.mjs --write`.

This is an implementation-plan snapshot, not live GitHub issue or Project state. In-progress work is not complete until reviewed and merged.

[Roadmap issue](https://github.com/powerpuff-kitty/nekon-toolkit/issues/1) · [Target Project 14](https://github.com/users/powerpuff-kitty/projects/14)

**Board membership is unverified.** `node scripts/sync-project.mjs --dry-run` prints the plan without credentials. `--apply` requires an authorized GitHub CLI and adds/verifies membership without changing existing fields.

## Roadmap

| Issue | Work | Priority | Plan status | Dependencies |
| --- | --- | --- | --- | --- |
| [#1](https://github.com/powerpuff-kitty/nekon-toolkit/issues/1) | Public developer-toolkit roadmap | P0 | planned | None |

## M0

| Issue | Work | Priority | Plan status | Dependencies |
| --- | --- | --- | --- | --- |
| [#2](https://github.com/powerpuff-kitty/nekon-toolkit/issues/2) | Public monorepo, agent guidance and local checks | P0 | in_progress | None |
| [#3](https://github.com/powerpuff-kitty/nekon-toolkit/issues/3) | Dependency inventory, provenance and ownership cutover | P0 | planned | [#2](https://github.com/powerpuff-kitty/nekon-toolkit/issues/2) |
| [#4](https://github.com/powerpuff-kitty/nekon-toolkit/issues/4) | Framework-independent design tokens and scoped themes | P0 | in_progress | [#2](https://github.com/powerpuff-kitty/nekon-toolkit/issues/2) |

## M1

| Issue | Work | Priority | Plan status | Dependencies |
| --- | --- | --- | --- | --- |
| [#5](https://github.com/powerpuff-kitty/nekon-toolkit/issues/5) | Canonical contracts and portable Rust/WASM closure | P0 | planned | [#3](https://github.com/powerpuff-kitty/nekon-toolkit/issues/3) |
| [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6) | Existing JavaScript SDK and client-runtime extraction | P0 | planned | [#5](https://github.com/powerpuff-kitty/nekon-toolkit/issues/5) |
| [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7) | Server helpers and bring-your-own-auth authorization | P0 | planned | [#5](https://github.com/powerpuff-kitty/nekon-toolkit/issues/5), [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6) |
| [#8](https://github.com/powerpuff-kitty/nekon-toolkit/issues/8) | Headless Vue 3 bindings | P0 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6) |
| [#9](https://github.com/powerpuff-kitty/nekon-toolkit/issues/9) | UI primitives and localization | P1 | planned | [#3](https://github.com/powerpuff-kitty/nekon-toolkit/issues/3), [#4](https://github.com/powerpuff-kitty/nekon-toolkit/issues/4) |
| [#10](https://github.com/powerpuff-kitty/nekon-toolkit/issues/10) | Identity, device, invitation and privacy components | P1 | planned | [#8](https://github.com/powerpuff-kitty/nekon-toolkit/issues/8), [#9](https://github.com/powerpuff-kitty/nekon-toolkit/issues/9) |
| [#11](https://github.com/powerpuff-kitty/nekon-toolkit/issues/11) | Communication and structured-interaction blocks | P1 | planned | [#8](https://github.com/powerpuff-kitty/nekon-toolkit/issues/8), [#9](https://github.com/powerpuff-kitty/nekon-toolkit/issues/9), [#10](https://github.com/powerpuff-kitty/nekon-toolkit/issues/10) |
| [#12](https://github.com/powerpuff-kitty/nekon-toolkit/issues/12) | SDK-only messenger and independent-client validation | P0 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#8](https://github.com/powerpuff-kitty/nekon-toolkit/issues/8) |
| [#13](https://github.com/powerpuff-kitty/nekon-toolkit/issues/13) | Public docs, quickstarts and generated references | P0 | planned | [#2](https://github.com/powerpuff-kitty/nekon-toolkit/issues/2) |
| [#14](https://github.com/powerpuff-kitty/nekon-toolkit/issues/14) | Vanilla, Vue and Lahaku-style starter applications | P1 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7), [#8](https://github.com/powerpuff-kitty/nekon-toolkit/issues/8), [#13](https://github.com/powerpuff-kitty/nekon-toolkit/issues/13) |
| [#15](https://github.com/powerpuff-kitty/nekon-toolkit/issues/15) | Cloud onboarding contracts and console components | P1 | planned | [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7), [#9](https://github.com/powerpuff-kitty/nekon-toolkit/issues/9) |
| [#21](https://github.com/powerpuff-kitty/nekon-toolkit/issues/21) | Package verification and controlled releases | P0 | planned | [#2](https://github.com/powerpuff-kitty/nekon-toolkit/issues/2) |

## M2

| Issue | Work | Priority | Plan status | Dependencies |
| --- | --- | --- | --- | --- |
| [#16](https://github.com/powerpuff-kitty/nekon-toolkit/issues/16) | Storybook and accessibility regression suite | P1 | planned | [#9](https://github.com/powerpuff-kitty/nekon-toolkit/issues/9), [#10](https://github.com/powerpuff-kitty/nekon-toolkit/issues/10), [#11](https://github.com/powerpuff-kitty/nekon-toolkit/issues/11) |
| [#17](https://github.com/powerpuff-kitty/nekon-toolkit/issues/17) | Figma design kit and component metadata | P2 | planned | [#4](https://github.com/powerpuff-kitty/nekon-toolkit/issues/4), [#9](https://github.com/powerpuff-kitty/nekon-toolkit/issues/9), [#16](https://github.com/powerpuff-kitty/nekon-toolkit/issues/16) |
| [#18](https://github.com/powerpuff-kitty/nekon-toolkit/issues/18) | CLI scaffolding, linking and doctor | P1 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7), [#14](https://github.com/powerpuff-kitty/nekon-toolkit/issues/14), [#15](https://github.com/powerpuff-kitty/nekon-toolkit/issues/15) |
| [#19](https://github.com/powerpuff-kitty/nekon-toolkit/issues/19) | Cloud sandbox and synthetic playground | P1 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#14](https://github.com/powerpuff-kitty/nekon-toolkit/issues/14), [#15](https://github.com/powerpuff-kitty/nekon-toolkit/issues/15) |
| [#20](https://github.com/powerpuff-kitty/nekon-toolkit/issues/20) | Deterministic tests and failure injection | P1 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7) |
| [#22](https://github.com/powerpuff-kitty/nekon-toolkit/issues/22) | Versioning, compatibility and migration policy | P1 | planned | [#5](https://github.com/powerpuff-kitty/nekon-toolkit/issues/5), [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#13](https://github.com/powerpuff-kitty/nekon-toolkit/issues/13), [#21](https://github.com/powerpuff-kitty/nekon-toolkit/issues/21) |
| [#23](https://github.com/powerpuff-kitty/nekon-toolkit/issues/23) | AI integration skills and machine-readable context | P1 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#13](https://github.com/powerpuff-kitty/nekon-toolkit/issues/13), [#14](https://github.com/powerpuff-kitty/nekon-toolkit/issues/14) |
| [#25](https://github.com/powerpuff-kitty/nekon-toolkit/issues/25) | React bindings and optional components | P2 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#8](https://github.com/powerpuff-kitty/nekon-toolkit/issues/8), [#9](https://github.com/powerpuff-kitty/nekon-toolkit/issues/9) |
| [#28](https://github.com/powerpuff-kitty/nekon-toolkit/issues/28) | Trust, licensing and production-evaluation docs | P1 | planned | [#3](https://github.com/powerpuff-kitty/nekon-toolkit/issues/3), [#13](https://github.com/powerpuff-kitty/nekon-toolkit/issues/13), [#21](https://github.com/powerpuff-kitty/nekon-toolkit/issues/21) |

## M3

| Issue | Work | Priority | Plan status | Dependencies |
| --- | --- | --- | --- | --- |
| [#24](https://github.com/powerpuff-kitty/nekon-toolkit/issues/24) | Documentation MCP and scoped administration | P2 | planned | [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7), [#13](https://github.com/powerpuff-kitty/nekon-toolkit/issues/13), [#23](https://github.com/powerpuff-kitty/nekon-toolkit/issues/23) |
| [#26](https://github.com/powerpuff-kitty/nekon-toolkit/issues/26) | Safe script/iframe widgets | P2 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#10](https://github.com/powerpuff-kitty/nekon-toolkit/issues/10), [#11](https://github.com/powerpuff-kitty/nekon-toolkit/issues/11), [#20](https://github.com/powerpuff-kitty/nekon-toolkit/issues/20) |
| [#27](https://github.com/powerpuff-kitty/nekon-toolkit/issues/27) | Private diagnostics, quotas and operational views | P1 | planned | [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7), [#15](https://github.com/powerpuff-kitty/nekon-toolkit/issues/15), [#20](https://github.com/powerpuff-kitty/nekon-toolkit/issues/20) |
| [#29](https://github.com/powerpuff-kitty/nekon-toolkit/issues/29) | Integration adapters and extension contracts | P2 | planned | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#7](https://github.com/powerpuff-kitty/nekon-toolkit/issues/7), [#14](https://github.com/powerpuff-kitty/nekon-toolkit/issues/14), [#20](https://github.com/powerpuff-kitty/nekon-toolkit/issues/20) |

## Deferred

| Issue | Work | Priority | Plan status | Dependencies |
| --- | --- | --- | --- | --- |
| [#30](https://github.com/powerpuff-kitty/nekon-toolkit/issues/30) | Voice/video, agent and device tooling | P2 | deferred | [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#10](https://github.com/powerpuff-kitty/nekon-toolkit/issues/10), [#11](https://github.com/powerpuff-kitty/nekon-toolkit/issues/11), [#20](https://github.com/powerpuff-kitty/nekon-toolkit/issues/20) |
| [#31](https://github.com/powerpuff-kitty/nekon-toolkit/issues/31) | New native distribution and on-premises feasibility | P3 | deferred | [#5](https://github.com/powerpuff-kitty/nekon-toolkit/issues/5), [#6](https://github.com/powerpuff-kitty/nekon-toolkit/issues/6), [#12](https://github.com/powerpuff-kitty/nekon-toolkit/issues/12), [#21](https://github.com/powerpuff-kitty/nekon-toolkit/issues/21), [#22](https://github.com/powerpuff-kitty/nekon-toolkit/issues/22) |

## Release boundary

The messenger and an independent client must complete enrollment, verified Room admission and encrypted exchange through the supported public SDK. Tokens, mocks and package builds do not establish that gate. Native/on-premises expansion remains deferred.
