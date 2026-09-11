# @nekon/tokens

Unpublished, dependency-free source preview of 91 NEKON design tokens. The
existing `--nk-*` variable names, six seeds and light/dark values are preserved.
Fonts are named as fallbacks only: no font files are bundled or fetched.

## Build and inspect

From the repository root, run `node packages/tokens/scripts/build.mjs`.
Do not use `npm install @nekon/tokens`: this change does not publish that package.
`node scripts/check-package.mjs` tests a locally packed artifact in an isolated
offline consumer without registry credentials.

Once consuming a reviewed local tarball or workspace package:

```ts
import '@nekon/tokens/scoped.css';
import { cssVar, getTokens, type TokenName } from '@nekon/tokens';

const text: TokenName = '--nk-color-text';
const variable = cssVar(text); // "var(--nk-color-text)"
const darkTokens = getTokens('dark'); // frozen CSS-expression values
```

```html
<section data-nk-theme="dark">
  <div class="my-ui">A dark embedded experience</div>
  <section data-nk-theme="light">A nested light experience</section>
</section>
```

`scoped.css` only declares variables within explicit theme scopes. It has no
`:root` rule. `tokens.css` additionally opts the document root into light tokens.
Both support `.nk-theme-light` and `.nk-theme-dark` aliases. Do not combine
conflicting class/data themes on the same element. There is no automatic OS
color-scheme selection: the host chooses the theme and native `color-scheme`.
Every theme boundary re-declares derived variables so nested themes resolve
against their own seeds rather than inheriting parent-computed colors.

## Customize without changing the host page

```css
.my-ui {
  color: var(--nk-color-text);
  background: var(--nk-color-surface);
  font-family: var(--nk-font-sans);
}
[data-nk-theme="dark"].my-brand {
  --nk-seed-accent: #ff4500;
  --nk-font-sans: system-ui, sans-serif;
}
```

Apply seed overrides on the same element as the theme boundary, or establish a
new themed scope where they change. Components should use semantic roles, not
seeds directly. Custom themes must be contrast-tested by the host application.
This package does not certify accessibility or supply focus/keyboard behavior.
The host must handle reduced motion, forced colors, direction and control styles.
Modern CSS support for `color-mix()` and `:where()` is required for these styles;
no legacy fallback palette is generated in this initial slice.

## Exports

- `@nekon/tokens`: frozen `tokens`, `themes`, `tokenNames`, `cssVar()` and `getTokens()`.
- `@nekon/tokens/tokens.css`: root defaults plus scoped themes.
- `@nekon/tokens/scoped.css`: opt-in scoped themes only.
- `@nekon/tokens/tokens.json`: machine-readable expression values and full themes.

JavaScript values are CSS expressions, not browser-resolved RGB values.
The ESM import does not import CSS or access the DOM. CSS imports are marked as
side effects so bundlers should retain them. Unsupported token/theme names throw
at runtime and are rejected by the generated TypeScript declarations.

Edit only `src/tokens.json`; `dist/` is generated. The compiler validates the
reviewed build input and token reference graph; it is not a general CSS sanitizer
for arbitrary untrusted runtime input. See the root extraction document for
provenance, licensing review and the not-yet-completed messenger cutover.
