# Toolkit continuation verification — 2026-09-11

This checkpoint follows the initial foundation commit
`a29e871d06145e0fb95915d155223b11bb273e69` in PR #32. It supersedes the earlier
checkpoint's *unverified browser rendering* limitation for the specific Chromium
smoke checks below. The environment's URL-navigation policies remain unchanged.

## Implemented

- An offline, in-memory Chromium regression gate using the actual token example
  and generated CSS, with Playwright pinned in a separate optional Python setup.
- A nine-unit declared SDK/Rust dependency inventory with 16 pinned Git inputs,
  deterministic ordering and a read-only local-source verification command.
- Strict Project inventory parsing: malformed/missing/unknown content is no longer
  mistaken for a draft or absent issue; invalid/duplicated URLs stop writes.
- Regression coverage for these behaviors and updated contributor commands.

## Checks actually run

| Check | Result |
| --- | --- |
| `node scripts/verify.mjs` | 62 Node tests passed, plus generated output, roadmap, inventory and packed-consumer checks |
| `node scripts/check-package.mjs --types` | Passed with TypeScript 5.8.3 |
| `python scripts/check-browser.py --chromium /usr/bin/chromium` | 14 browser checks passed |
| Runtime | Node 22.16.0, npm 10.9.2, Playwright 1.57.0, Chromium 144.0.7559.96 |

Original executable/test/example files used for the baseline were materialized
from connector-returned contents and matched against their fetched Git blob IDs.
The original 30-test suite was rerun before the changes. Direct Git network
checkout was unavailable; no credentials or private source archive were used.

Browser checks covered host isolation, computed direct/derived colors, nested
light/dark scopes, class aliases, runtime switching, seed overrides, root defaults,
320/390/1440-pixel layouts, basic keyboard focus, forced colors/reduced motion and
an RTL smoke test. The context was offline, external requests were aborted, and
no network requests or page errors occurred. Tests used `set_content` on an empty
page: no local server, URL navigation or browser-policy change was required.

The source-inspection command was integration-tested against disposable synthetic
Git repositories, including wrong revisions/hashes, dirty/untracked files,
symlinks and external Git filters. The actual private repository's recorded inputs
were read through the connector; the `--source` command itself was **not** run
against a local private checkout because none was available.

## Boundaries and unfinished work

These are development checks, not signed release evidence, an independent
security audit, WCAG certification or a full cross-browser test matrix. Python/
Playwright are optional contributor tools, not shipped package dependencies.

Live Project 14 membership/fields remain unverified. No authorized Project API or
CLI session was available. The helper was not used to mutate the live board.

The SDK inventory does not prove complete source/build/test dependency closure.
Lockfiles, imports/includes/assets, license review, active-branch reconciliation,
private-consumer cutover and real encrypted two-client validation remain pending.
No SDK/crypto source was forked or moved, no packages published, no production
services changed, and no GitHub Actions added. Issues remain open for review and
the remaining acceptance criteria.
