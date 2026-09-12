# Developer documentation portal — local source preview

Partial implementation of roadmap issue #13. Build a no-login documentation
snapshot from actual package exports and emitted TypeScript declarations, not
hand-maintained API lists or invented install commands. This is not a hosted
service, complete encrypted exchange guide, or production SDK release.

## Use

With the repository's pinned TypeScript 5.8.3 and Node 22+ available:

```sh
npm run build:docs
npm run check:docs
```

`build:docs` produces `docs/portal/dist/index.html` and `api.json` from the existing
packages. `check:docs` runs the generator's tests and the complete installed-client
verification lane. The ordinary `npm run check` also retains its previous suites
and includes the new docs checks. For optional native HTTP coverage:

```sh
node scripts/verify-application-event.mjs --http
```

Generated output is not committed. The HTML is self-contained: semantic token
CSS, local/system font stacks, hash-bound scripts/styles, local search, fragment
navigation and a fully readable no-JavaScript fallback. It makes no network or
storage calls. No hosting, registry publication, analytics or fonts are included.
Direct file navigation and other browser engines require separate verification;
the provided browser runner uses generated HTML in memory with default policies.

```sh
python3 scripts/check-docs-portal-browser.py --chromium /path/to/chromium
```

## Author and maintain

Edit `catalog.json` for guide text, navigation, maturity boundaries, execution
contexts, credentials and curated recovery advice. Its strict structured format
allows paragraphs, headings, lists, local page links, checked example references
and the selected error table. It does not accept raw HTML, arbitrary remote includes
or unbounded documents. The snapshot label is explicit; package versions are read
from their real manifests. There is no invented version-switching history.

Every public export in each configured package must have exactly one module
entry. Removing a documented export or adding an undocumented one fails the build.
The generated references use TypeScript's checker to follow re-exports and print
the originating declarations, including interfaces and type aliases. Documented
modules are never executed by the generator. Runtime export presence is checked
separately against the installed packages. The JSON catalog can be consumed by
future documentation tooling; it is a snapshot, not a hosted API.

Examples are included verbatim from maintained source. Both executable examples
run in the canonical package gate; the enrollment composition example is strictly
type-checked and explicitly labeled compile-only. It requires real host adapters
and is not runnable onboarding. Selected error identifiers must appear as actual
string literals in the named emitted implementation, not merely in comments.
This catches stale names; it does not prove complete error coverage or authorize
recovery actions.

`api.json` records exact hashes of the authoring content, examples, export maps,
emitted contracts, selected implementation files and rendering inputs. This is
reproducibility metadata, not a signature, an independent audit, or proof that an
untrusted producer supplied genuine artifacts. Absolute host paths and timestamps
are excluded. Repeated builds from the same inputs must match. Validation failures
remove old/partial output instead of leaving a stale-looking successful build.

## Verification boundary

The combined client verifier generates docs from the actual offline-installed
SDK/runtime files, then compares HTML and JSON with the local build byte-for-byte.
Token artifacts use the separate existing token verification lane. New generator
unit tests use explicitly synthetic declaration fixtures; they do not substitute
for the packaged check. No runtime source, credential rule, byte limit or package
release guard is relaxed by this documentation feature.

The portal labels incomplete browser vault/device/activation adapters, proposed
opt-in V2 storage, Room/MLS integration and Cloud provisioning. Two-browser
encrypted exchange, component-library/framework quickstarts, full hosted quota/
retention policies, production revocation and complete error coverage remain open
under #13 and their owning issues. Publishing the portal requires a separate,
explicit deployment task. Keep #13 open.
