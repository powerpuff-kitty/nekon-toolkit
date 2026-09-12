# Extraction checkpoint — 2026-09-11

## First reviewed slice

Source repository: `powerpuff-kitty/nekon` (access controlled).
Source commit: `2b5e093c8663014dde37db98b8d3e7941b33f823`.
Source path: `packages/ui/src/tokens.css`.
Source Git blob: `038b72c5f4ee865e5b9ba80d7f2d5acca12dfb40`.
The blob was confirmed at the pinned commit before this extraction.

Transferred the 91 base custom-property values and eight dark-theme overrides,
normalizing whitespace and sorting keys in JSON. Preserved `--nk-*` names and the
existing palette/font stacks. Excluded global focus/control rules, logo/mask CSS,
font files and native `color-scheme` properties. The scoped CSS is intentionally
not a byte-for-byte copy of the old stylesheet. No private git history is copied.

`extraction-manifest.json` records the public snapshot digest and initial
ownership plan. This is provenance, not a license grant, audit or full dependency
closure proof. Licenses/asset rights remain gated by #28.

## Initial dependency map, not a completed audit

| Area | Plan | Gate |
| --- | --- | --- |
| UI token variables | Public preview implemented; private consumer unchanged | #4, then #3/#12 cutover |
| Existing @nekon/sdk and client-runtime | Extract together after dependency closure review | #3, #5, #6 |
| Required portable Rust/WASM crates and build inputs | Include public build sources and preserve existing crypto semantics | #5 |
| UI primitives and i18n | Separate generic controls/localization from app and heavy optional assets | #9 |
| Hosted platform, billing, migrations and operator tooling | Keep private | #15/#27 public interfaces only |
| New native SDKs and on-premises distribution | Deferred | #31 |

The entire SDK graph and unmerged platform changes have not been audited in this
foundation task. Reconcile them before extraction; do not copy stale branches.
The existing messenger and its current production behavior are untouched. Before
cutover, compare with this pinned snapshot, move token ownership once, and remove
the duplicate variable definitions from the consumer. A public snapshot is not
an excuse to maintain a permanent parallel implementation.
