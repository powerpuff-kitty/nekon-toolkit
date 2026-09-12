# Developer workbench — local event preview

Partial implementation of #19; related to #13 and #14. This is public example UI,
not the private Cloud control plane, a messenger, or the SDK-only release gate #12.

## Run

From an installed `nekon-toolkit` workspace with its pinned tools:

```sh
pnpm check:workbench
```

Or use the equivalent existing builders and the new example build/check:

```sh
node packages/tokens/scripts/build.mjs
node scripts/build-application-event.mjs
node scripts/build-developer-workbench.mjs
node --test tests/developer-workbench/*.test.mjs
```

Open `examples/developer-workbench/dist/index.html` in a modern browser supporting
ES modules, import maps and CSS color-mix. The source `index.html` is a build
template; open the generated file, not the template. Generated output is not source
and should not be committed. The build uses only already-emitted public package
entries and the existing token compiler's CSS. It never substitutes another codec.

## Working controls

Choose a synthetic text message, sensor reading or device command. Edit its type,
content, version and synthetic Room/Event IDs; encode with the public SDK and
inspect metadata, plaintext content, byte counts and canonical hex. Re-inspect
the emitted bytes or paste a bounded hex payload. Invalid JSON syntax, metadata,
hex, oversized content and noncanonical payloads are rejected. JSON syntax checks
are not application-schema validation. Command content is never executed.

All user content is rendered with textContent/value, not HTML. Editing invalidates
previous results. Clear all and pagehide clear transient UI values. No message is
sent, no identity is verified, and no Room membership or permissions are granted.

The inspector is a plaintext development tool. It is not a safe place for real
secrets, private keys, production tokens or customer messages. Temporary byte
arrays are cleared after use, but browser-managed strings/history, extensions
and all memory copies cannot be guaranteed erased. No plaintext is written to
storage by this example. No telemetry, fonts or remote resources are requested.

The generated document uses hash-bound inline scripts/styles and embedded data-URL
modules with connect-src none, form-action none, base-uri none and no images,
frames or workers. It is not a security boundary against a malicious local host,
browser extension or modified artifact. The build does not register a service worker.

## Verification checkpoint

Executed on this candidate: 38 Node tests using the actual emitted SDK and codec;
22 Chromium UI checks using the actual generated HTML, embedded modules and DOM.
UI checks include sample round-trips, Unicode byte counts, malformed inputs,
stale-output removal, text-only HTML rendering, clearing, responsive 320/390px
layouts, keyboard focus in forced colors and local-module failure. No fetch,
WebSocket or browser-storage calls were observed; no HTTP requests were made.
The builder was deterministic in repeated execution and its CSP hashes matched.

Node 22.16.0, TypeScript 5.8.3 (matching this toolkit's declaration), Playwright
1.57.0 and Chromium 144.0.7559.96. Four fetched public source inputs (codec,
SDK wrapper, tokens and token compiler) were hash-checked unchanged before use.
Those TypeScript modules passed strict compilation/declaration emission. Local
module resolution used a reconstructed source subset, not a fresh frozen pnpm
installation or the complete installed-package lane. Chromium received HTML in
memory with other requests denied; no navigation policy was changed or bypassed.
This is not file-navigation, TLS/CORS, Cloud, encryption or browser-matrix evidence.

Run the optional UI checks after the build:

```sh
python3 scripts/check-developer-workbench-browser.py --chromium /path/to/chromium
```

The full foundation/installed-package/transport/browser suites, frozen workspace
install, manual assistive-technology review, Rust/WASM and live messaging gates
were not rerun in this continuation. No older test count is summed into these
results. #19 remains open: real isolated Cloud resources, provisioning, quotas
and hosted abuse controls are not implemented here. Packages remain unpublished
and licensing-gated; private application code and services are unchanged.
