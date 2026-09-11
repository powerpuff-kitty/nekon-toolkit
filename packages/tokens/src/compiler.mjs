/** Pure build-time compiler. This is not a general CSS sanitizer or user-input API. */
const NAME = /^--nk-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORBIDDEN = /[;{}<>\\\u0000-\u001f]|\/\*|\*\/|url\s*\(|@|expression\s*\(/i;
const THEMES = ['light', 'dark'];

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function ordered(value) {
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
}

function declarations(value, label) {
  record(value, label);
  for (const [name, css] of Object.entries(value)) {
    if (!NAME.test(name)) throw new TypeError(`Invalid token name: ${name}`);
    if (typeof css !== 'string' || css.trim() === '' || css !== css.trim() || FORBIDDEN.test(css)) {
      throw new TypeError(`Invalid CSS value for ${name}`);
    }
  }
}

function checkReferences(values) {
  const active = new Set();
  const done = new Set();
  function visit(name) {
    if (!Object.hasOwn(values, name)) throw new TypeError(`Unknown token reference: ${name}`);
    if (active.has(name)) throw new TypeError(`Cyclic token reference: ${name}`);
    if (done.has(name)) return;
    active.add(name);
    for (const match of values[name].matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) visit(match[1]);
    active.delete(name);
    done.add(name);
  }
  for (const name of Object.keys(values)) visit(name);
}

export function validateTokens(source) {
  record(source, 'Token source');
  if (source.schemaVersion !== 1) throw new TypeError('Unsupported token schema version');
  if (Object.keys(source).some(key => !['schemaVersion', 'base', 'themes'].includes(key))) {
    throw new TypeError('Unknown token source field');
  }
  declarations(source.base, 'Base tokens');
  if (Object.keys(source.base).length === 0) throw new TypeError('Base tokens must not be empty');
  record(source.themes, 'Themes');
  if (Object.keys(source.themes).sort().join(',') !== 'dark,light') {
    throw new TypeError('Exactly light and dark themes are required');
  }
  checkReferences(source.base);
  for (const theme of THEMES) {
    declarations(source.themes[theme], `${theme} theme`);
    for (const name of Object.keys(source.themes[theme])) {
      if (!Object.hasOwn(source.base, name)) throw new TypeError(`Unknown override: ${name}`);
    }
    checkReferences({ ...source.base, ...source.themes[theme] });
  }
  return source;
}

function rule(selector, values) {
  return `${selector} {\n${Object.entries(values).map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}\n`;
}

export function compileTokens(input) {
  const source = validateTokens(input);
  const base = ordered(source.base);
  const themes = Object.fromEntries(THEMES.map(name => [name, ordered({ ...base, ...source.themes[name] })]));
  // Re-declare every semantic variable at each theme boundary: inherited computed
  // custom properties otherwise retain their parent's seed-derived values.
  const scoped = THEMES.map(name => rule(`:where([data-nk-theme="${name}"], .nk-theme-${name})`, themes[name])).join('\n');
  const banner = '/* Generated from src/tokens.json. Do not edit. Variables only; no control styles or assets. */\n';
  const json = value => JSON.stringify(value, null, 2);
  const names = Object.keys(base);
  const js = `// Generated from src/tokens.json. No DOM, CSS import or network side effects.\n` +
    `export const tokens = Object.freeze(${json(base)});\n` +
    `export const themes = Object.freeze({\n  light: Object.freeze(${json(themes.light)}),\n  dark: Object.freeze(${json(themes.dark)})\n});\n` +
    `export const tokenNames = Object.freeze(${json(names)});\n` +
    `export function cssVar(name) {\n  if (typeof name !== 'string' || !Object.hasOwn(tokens, name)) throw new TypeError('Unknown NEKON token');\n  return 'var(' + name + ')';\n}\n` +
    `export function getTokens(theme = 'light') {\n  if (theme !== 'light' && theme !== 'dark') throw new TypeError('Unknown NEKON theme');\n  return themes[theme];\n}\n`;
  const types = `// Generated from src/tokens.json.\n` +
    `export type TokenName = ${names.map(name => JSON.stringify(name)).join(' | ')};\n` +
    `export type ThemeName = 'light' | 'dark';\n` +
    `export declare const tokens: Readonly<Record<TokenName, string>>;\n` +
    `export declare const themes: Readonly<Record<ThemeName, Readonly<Record<TokenName, string>>>>;\n` +
    `export declare const tokenNames: readonly TokenName[];\n` +
    `export declare function cssVar(name: TokenName): string;\n` +
    `export declare function getTokens(theme?: ThemeName): Readonly<Record<TokenName, string>>;\n`;
  return {
    'tokens.css': banner + rule(':where(:root)', themes.light) + '\n' + scoped,
    'scoped.css': banner + scoped,
    'tokens.json': json({ schemaVersion: 1, base, themes }) + '\n',
    'index.js': js,
    'index.d.ts': types,
  };
}
