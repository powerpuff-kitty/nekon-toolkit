/** Narrow build adapter for the pinned authorization resource; not a general JS rewriter. */
const imports = Object.freeze({
  javascript: Object.freeze([
    './client-binary-codec', './client-api-error', './client-response-validation',
  ]),
  declarations: Object.freeze(['./client-transport']),
});

export function normalizeAuthorizationImports(source, kind) {
  if (typeof source !== 'string' || !Object.hasOwn(imports, kind)) {
    throw new TypeError('Unsupported authorization output');
  }
  const lines = source.split('\n');
  const expected = imports[kind];
  for (let index = 0; index < expected.length; index++) {
    // TypeScript 5.8.3 emits these known static imports on the initial lines.
    // Require the exact form/order; never rewrite body strings or unknown modules.
    const match = /^(import (?:type )?\{[A-Za-z0-9_, ]+\} from ")(\.\/[a-z-]+)(?:\.js)?(";)$/.exec(lines[index] ?? '');
    if (!match || match[2] !== expected[index]) {
      throw new Error(`Authorization output import mismatch at line ${index + 1}`);
    }
    lines[index] = `${match[1]}${match[2]}.js${match[3]}`;
  }
  const rest = lines.slice(expected.length).join('\n');
  if (/^\s*(?:import\b|export\s+(?:type\s+)?[\{*])[^\n]*\bfrom\s*["']\./m.test(rest) ||
      /\bimport\s*\(\s*["']\./.test(rest)) {
    throw new Error('Additional relative authorization dependency requires review');
  }
  return lines.join('\n');
}
