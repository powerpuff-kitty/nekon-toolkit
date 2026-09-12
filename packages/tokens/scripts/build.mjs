import { readFile, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { compileTokens } from '../src/compiler.mjs';

const source = JSON.parse(await readFile(new URL('../src/tokens.json', import.meta.url), 'utf8'));
const outputs = compileTokens(source);
const directory = new URL('../dist/', import.meta.url);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('Usage: build.mjs [--check]');
if (args[0] === '--check') {
  const names = (await readdir(directory)).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(outputs).sort())) throw new Error('Unexpected generated artifact inventory');
  for (const [name, content] of Object.entries(outputs)) {
    if (await readFile(new URL(name, directory), 'utf8') !== content) throw new Error(`Stale generated artifact: ${name}`);
  }
} else {
  // Validate all inputs before replacing the fixed generated-output directory.
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) await writeFile(new URL(name, directory), content);
}
console.log(`Tokens: ${Object.keys(source.base).length} variables, 2 themes, ${Object.keys(outputs).length} deterministic artifacts.`);
