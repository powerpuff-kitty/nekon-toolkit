import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileTokens, validateTokens } from '../packages/tokens/src/compiler.mjs';

const source = JSON.parse(await readFile(new URL('../packages/tokens/src/tokens.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(source);

test('preserves the reviewed token count, typography and six seeds', () => {
  validateTokens(source);
  assert.equal(Object.keys(source.base).length, 91);
  assert.equal(Object.keys(source.base).filter(name => name.startsWith('--nk-seed-')).length, 6);
  assert.match(source.base['--nk-font-sans'], /Geist Variable/);
  assert.equal(source.base['--nk-seed-accent'], '#c73500');
  assert.equal(source.themes.dark['--nk-seed-accent'], '#ff4500');
});

test('compiles deterministically regardless of input key order without mutation', () => {
  const reordered = copy();
  reordered.base = Object.fromEntries(Object.entries(reordered.base).reverse());
  const before = JSON.stringify(source);
  assert.deepEqual(compileTokens(source), compileTokens(reordered));
  assert.equal(JSON.stringify(source), before);
});

test('scoped CSS re-declares all derived tokens at both nested theme boundaries', () => {
  const css = compileTokens(source)['scoped.css'];
  assert.doesNotMatch(css, /:root/);
  assert.equal((css.match(/--nk-color-surface:/g) ?? []).length, 2);
  assert.equal((css.match(/--nk-seed-background:/g) ?? []).length, 2);
  assert.match(css, /data-nk-theme="light"/);
  assert.match(css, /\.nk-theme-dark/);
});

test('CSS emits variables only, with no font/assets, focus resets or native-control properties', () => {
  for (const name of ['tokens.css', 'scoped.css']) {
    const css = compileTokens(source)[name];
    assert.doesNotMatch(css, /@font-face|url\s*\(|@import|outline\s*:|color-scheme\s*:|:focus|\.nk-logo/i);
    for (const body of css.matchAll(/\{([^{}]*)\}/g)) {
      assert.ok(body[1].trim().split('\n').every(line => /^\s*--nk-/.test(line)));
    }
  }
});

test('generated JS is DOM-free, immutable and rejects invalid runtime input', async () => {
  const js = compileTokens(source)['index.js'];
  const api = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  assert.equal(api.cssVar('--nk-color-text'), 'var(--nk-color-text)');
  assert.equal(api.getTokens()['--nk-seed-background'], '#f7f7f4');
  assert.equal(api.getTokens('dark')['--nk-seed-background'], '#0c100f');
  assert.ok(Object.isFrozen(api.tokens));
  assert.ok(Object.isFrozen(api.themes.dark));
  assert.ok(Object.isFrozen(api.tokenNames));
  assert.throws(() => api.cssVar('toString'), /Unknown NEKON token/);
  assert.throws(() => api.cssVar({}), /Unknown NEKON token/);
  assert.throws(() => api.getTokens('automatic'), /Unknown NEKON theme/);
  assert.throws(() => { api.tokens['--nk-color-text'] = 'red'; }, TypeError);
});

for (const [label, mutate, message] of [
  ['unknown reference', s => { s.base['--nk-color-text'] = 'var(--nk-missing)'; }, /Unknown token reference/],
  ['external reference', s => { s.base['--nk-color-text'] = 'var(--outside)'; }, /Unknown token reference/],
  ['direct cycle', s => { s.base['--nk-color-text'] = 'var(--nk-color-text)'; }, /Cyclic token reference/],
  ['indirect cycle', s => { s.base['--nk-color-text'] = 'var(--nk-color-canvas)'; s.base['--nk-color-canvas'] = 'var(--nk-color-text)'; }, /Cyclic token reference/],
  ['theme cycle', s => { s.themes.dark['--nk-seed-background'] = 'var(--nk-color-canvas)'; }, /Cyclic token reference/],
  ['unknown override', s => { s.themes.dark['--nk-not-declared'] = 'red'; }, /Unknown override/],
  ['invalid name', s => { s.base['color'] = 'red'; }, /Invalid token name/],
  ['CSS injection', s => { s.base['--nk-color-text'] = 'red; outline: none'; }, /Invalid CSS value/],
  ['remote asset', s => { s.base['--nk-color-text'] = 'url(https://example.invalid/x)'; }, /Invalid CSS value/],
  ['CSS escape', s => { s.base['--nk-color-text'] = String.raw`u\72l(x)`; }, /Invalid CSS value/],
  ['missing theme', s => { delete s.themes.dark; }, /Exactly light and dark/],
  ['unknown schema', s => { s.schemaVersion = 2; }, /Unsupported token schema/],
  ['extra source field', s => { s.executable = 'x'; }, /Unknown token source field/],
  ['empty source', s => { s.base = {}; }, /must not be empty/],
  ['non-string', s => { s.base['--nk-color-text'] = 42; }, /Invalid CSS value/],
]) {
  test(`rejects ${label}`, () => {
    const modified = copy(); mutate(modified);
    assert.throws(() => compileTokens(modified), message);
  });
}

test('rejects non-object inputs and theme maps', () => {
  for (const value of [null, [], 'tokens']) assert.throws(() => validateTokens(value), /plain object/);
  const s = copy(); s.themes = []; assert.throws(() => validateTokens(s), /plain object/);
});
