import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'powerpuff-kitty/nekon-toolkit';
export const PROJECT = Object.freeze({ owner: 'powerpuff-kitty', number: 14 });
const PHASES = ['Roadmap', 'M0', 'M1', 'M2', 'M3', 'Deferred'];

export function validateRoadmap(data) {
  if (!data || data.schemaVersion !== 1 || data.repository !== REPOSITORY ||
      data.project?.owner !== PROJECT.owner || data.project?.number !== PROJECT.number ||
      !Array.isArray(data.items) || data.items.length === 0) throw new TypeError('Invalid roadmap header');
  const items = new Map();
  for (const item of data.items) {
    if (!Number.isSafeInteger(item.issue) || item.issue < 1 || items.has(item.issue) ||
        typeof item.title !== 'string' || !item.title.trim() || /[\n\r|]/.test(item.title) ||
        !['P0', 'P1', 'P2', 'P3'].includes(item.priority) || !PHASES.includes(item.phase) ||
        !['planned', 'in_progress', 'deferred'].includes(item.status) ||
        !Array.isArray(item.dependencies) || new Set(item.dependencies).size !== item.dependencies.length) {
      throw new TypeError('Invalid or duplicate roadmap item');
    }
    items.set(item.issue, item);
  }
  const active = new Set();
  const done = new Set();
  function visit(number) {
    if (!items.has(number)) throw new TypeError(`Missing dependency: #${number}`);
    if (active.has(number)) throw new TypeError(`Cyclic roadmap dependency: #${number}`);
    if (done.has(number)) return;
    active.add(number);
    for (const dependency of items.get(number).dependencies) visit(dependency);
    active.delete(number); done.add(number);
  }
  for (const number of items.keys()) visit(number);
  return data;
}

export function issueUrl(number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError('Invalid issue number');
  return `https://github.com/${REPOSITORY}/issues/${number}`;
}

export function renderRoadmap(input) {
  const data = validateRoadmap(input);
  let text = '# NEKON Toolkit roadmap\n\nGenerated from `roadmap.json`; edit the JSON and run `node scripts/roadmap.mjs --write`.\n\n';
  text += 'This is an implementation-plan snapshot, not live GitHub issue or Project state. In-progress work is not complete until reviewed and merged.\n\n';
  text += '[Roadmap issue](https://github.com/powerpuff-kitty/nekon-toolkit/issues/1) · [Target Project 14](https://github.com/users/powerpuff-kitty/projects/14)\n\n';
  text += '**Board membership is unverified.** `node scripts/sync-project.mjs --dry-run` prints the plan without credentials. `--apply` requires an authorized GitHub CLI and adds/verifies membership without changing existing fields.\n\n';
  for (const phase of PHASES) {
    text += `## ${phase}\n\n| Issue | Work | Priority | Plan status | Dependencies |\n| --- | --- | --- | --- | --- |\n`;
    for (const item of data.items.filter(item => item.phase === phase)) {
      text += `| [#${item.issue}](${issueUrl(item.issue)}) | ${item.title} | ${item.priority} | ${item.status} | ${item.dependencies.map(number => `[#${number}](${issueUrl(number)})`).join(', ') || 'None'} |\n`;
    }
    text += '\n';
  }
  text += '## Release boundary\n\nThe messenger and an independent client must complete enrollment, verified Room admission and encrypted exchange through the supported public SDK. Tokens, mocks and package builds do not establish that gate. Native/on-premises expansion remains deferred.\n';
  return text;
}

export async function loadRoadmap() {
  return validateRoadmap(JSON.parse(await readFile(new URL('../roadmap.json', import.meta.url), 'utf8')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--write', '--check'].includes(args[0])) throw new Error('Usage: roadmap.mjs --write|--check');
  const text = renderRoadmap(await loadRoadmap());
  const file = new URL('../ROADMAP.md', import.meta.url);
  if (args[0] === '--write') await writeFile(file, text);
  else if (await readFile(file, 'utf8') !== text) throw new Error('ROADMAP.md is stale');
  console.log('Roadmap schema, dependencies and generated documentation verified.');
}
