/** Exact emitted-import adapter for the pinned enrollment files, not arbitrary JavaScript. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const expected = Object.freeze({
  'application-enrollment-coordinator.js': ['./application-enrollment-validation'],
  'application-enrollment-coordinator.d.ts': ['./application-enrollment-types'],
  'application-enrollment-validation.js': [],
  'application-enrollment-validation.d.ts': ['./application-enrollment-types'],
  'application-enrollment-types.js': [],
  'application-enrollment-types.d.ts': [],
  'application-enrollment-bound-vault.js': ['./application-enrollment-validation'],
  'application-enrollment-bound-vault.d.ts': ['./application-enrollment-types'],
});

export function normalizeEnrollmentImports(source, file) {
  if (typeof source !== 'string' || !Object.hasOwn(expected, file)) {
    throw new TypeError('Unsupported enrollment output');
  }
  // Only compiler-emitted top-level static import declarations qualify. String
  // contents in function bodies are not replaced. Counts/order must match source.
  const found = [];
  const output = source.replace(/^import (?:type )?\{[^}]*\} from "(\.[^"\n]+)";$/gm, (line, specifier) => {
    const bare = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
    found.push(bare);
    return line.replace(`"${specifier}"`, `"${bare}.js"`);
  });
  if (JSON.stringify(found) !== JSON.stringify(expected[file])) {
    throw new Error(`Enrollment output dependency mismatch: ${file}`);
  }
  // These pinned implementations have no dynamic imports or relative re-exports.
  const remainder = source.replace(/^import (?:type )?\{[^}]*\} from "(\.[^"\n]+)";$/gm, "");
  if (/^import\b/m.test(remainder) || /\bimport\s*\(/.test(source) || /^export[^\n]*\bfrom\s*["']\./m.test(source)) {
    throw new Error(`Unreviewed enrollment dependency: ${file}`);
  }
  return output;
}

export async function normalizeEnrollmentDirectory(directory) {
  // Read and validate every output before writing any normalized files.
  const outputs = await Promise.all(Object.keys(expected).map(async file => [
    file, normalizeEnrollmentImports(await readFile(join(directory, file), 'utf8'), file),
  ]));
  for (const [file, text] of outputs) await writeFile(join(directory, file), text);
}
