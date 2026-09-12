# Developer workbench — local event preview

Partial implementation of #19, related to #13/#14. This is an offline public
example, not the private Cloud console, a messenger or the #12 release gate.

## Build and verify

With the pinned TypeScript 5.8.3 and Node 22+ available:

```sh
npm run check:workbench
# Include the complete repository checks:
npm run check
# Also include transport and authorization native HTTP tests:
node scripts/verify-application-event.mjs --http
```

The pnpm equivalents work in an installed workspace. `check:workbench` deliberately
uses the combined installed-client verifier: it builds the SDK, packs both real
packages, installs them offline, and runs all client suites plus the workbench.
The workbench tests import the public package export, not an uninstalled workspace
path. No temporary source aliases or modified package manifests are required.
The generated document must match the version built from installed package bytes.

The artifact is `examples/developer-workbench/dist/index.html`; the source
`index.html` is only a build template. To build without tests, use `npm run build`.
Generated output is not committed and contains no font files or remote assets.

## Controls and boundaries

Load a synthetic message, sensor reading or inert device command. Edit type,
content, schema version and synthetic Room/Event IDs. Encode/inspect with the
existing public SDK, view byte counts, metadata, plaintext or binary hex, and
re-inspect existing canonical hex. Malformed and oversized inputs are rejected.
JSON syntax checking does not validate an application schema or normalize bytes.
Commands are never executed, and user content is rendered as text, not HTML.

Editing invalidates previous results. Clear all and pagehide clear transient UI
values. No request, identity enrollment, Room membership or message delivery is
performed. Do not enter real keys, tokens, private messages or other secrets.
Clearing arrays/UI does not guarantee erasure of browser-managed copies.

The generated HTML embeds data-URL modules and hash-bound inline assets. Its CSP
blocks network connections, forms, images, fonts, frames and workers. This is not
a security boundary against an altered artifact, host or browser extension.

## Browser checks

```sh
python3 scripts/check-developer-workbench-browser.py --chromium /path/to/chromium
```

The 22 existing checks exercise the actual HTML/modules in memory, including
sample round-trips, Unicode, invalid input, text-only rendering, clearing, narrow
layouts, keyboard focus/forced colors and failed local SDK loading. They do not
establish hosted-service behavior, screen-reader accessibility or cross-browser
support. Direct file navigation was blocked by the execution environment; no
policy workaround was used. See the latest integration checkpoint for results.

The Node tests now run against installed canonical packages. Seven integration
checks also guard root commands, package resolution, artifact equality and stale
output cleanup on builder failure. Runtime sources and the UI/model/CSS/builder
are unchanged from the original workbench PR; only its test import and verification
integration changed. No package release, hosting or live Cloud provisioning is
implied. #19 remains open for real resources, quotas and abuse controls.
