# Contributing

Start with the linked roadmap issue and its acceptance criteria. Use a focused
feature branch and pull request. Public/private source extraction must preserve
provenance and existing notices; do not copy private history or operational docs.

Run `node scripts/verify.mjs`. Generated `dist/` directories are not committed.
Changes to token API/types should also pass
`node scripts/check-package.mjs --types` with the compiler version recorded.
Update `roadmap.json` and regenerate `ROADMAP.md` when the plan changes.

Describe tests and limitations in the PR. No live service access or credentials
are needed for foundation checks. Do not add GitHub Actions or publish packages
as part of a normal code change. External contributor licensing/agreements and
the project-wide license remain to be settled in #28; do not assume an MIT grant.

For sensitive reports, follow SECURITY.md rather than posting details publicly.
