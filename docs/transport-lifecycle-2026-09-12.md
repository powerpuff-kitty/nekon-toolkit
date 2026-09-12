# Transport lifecycle synchronization — 2026-09-12

Continues #3/#6/#21 and draft PR #34. The three transport files are now pinned
to coordinated upstream candidate 39c8e2b268e1ee0fd7bf69f21827e1aa0a1dc186.
Source bytes and provenance checks remain synchronized; there is no independent
public runtime fork or completed ownership cutover.

## Behavior

Internally owned discovery/ticket error responses are canceled without draining
or waiting for their bodies. Cancellation failure does not replace the HTTP
error. Already canceled requests do not dispatch, and cancellation during header
observation disposes late responses, including empty ones. Generic request()
responses remain caller-owned even on HTTP errors. Consumers should read or
cancel them. Durable writes gain no automatic retry or new implicit deadline.

## Repeatable checks

```
node scripts/check-transport-lifecycle.mjs
node scripts/check-transport-lifecycle.mjs --http
node scripts/build-application-event.mjs
python3 scripts/check-transport-lifecycle-browser.py --chromium /path/to/chromium
```

The first command strictly compiles the real transport sources into a disposable
directory and runs 92 cases (59 existing +33 lifecycle). --http adds 10 native
fetch/HTTP tests using ephemeral loopback servers and synthetic data, for 102.
No external endpoint or credential is required. The servers are torn down by tests.
This supplemental source lane does not replace the installed-package gate.
The package gate now also registers the 33 lifecycle cases against installed
public exports; that complete package lane must be rerun before release.

## Verification actually executed in this continuation

- Previous candidate: 29 failures /4 passes in the new 33-case lifecycle suite.
- Fixed exact sources: 92/92 synthetic cases and 10/10 native HTTP cases passed,
  including reruns through both the upstream and toolkit supplemental runners.
- HTTP checks cover version headers, redirects, chunked/clone/raw-reader byte
  bounds, gzip decoded-byte limits, rejected-response connection closure,
  caller cancellation and one-shot POST behavior.
- 13 Chromium checks passed using emitted ESM modules fulfilled in memory.
  No live service connection, browser-policy change, or external request.
- Strict declaration compilation passed with available TypeScript 5.8.3.
- Node 22.16.0, Chromium 144.0.7559.96, Playwright 1.57.0.

Chromium can translate a stream error to TypeError in native convenience methods.
The browser checks assert cancellation cause plus raw-reader failure separately;
error-message differences are not treated as a reason to relax byte limits.

## Unrun / unchanged

The full root/foundation and combined installed event+transport package suites,
pnpm frozen installation, pinned upstream compiler/workspace, Vitest/legacy
integration, Rust/WASM/MLS and security/agentic lanes were not rerun in this
continuation. Local HTTP is not production TLS, browser CORS/cookie, live socket
admission or encrypted interoperability evidence. Older checkpoint counts are
historical, not additional tests executed now.

No packages published, main merge, deployment, secret rotation or Actions change.
The full SDK, verified Room owner, private messenger migration and real encrypted
two-client gate remain open. Project 14 membership remains unverified.
