/** Read-only inventory gate. It never copies source, downloads code or executes source scripts. */
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { devNull } from 'node:os';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-z][a-z0-9-]*$/;
const SOURCE = 'powerpuff-kitty/nekon';
const validId = value => typeof value === 'string' && ID.test(value);
const validSha = value => typeof value === 'string' && SHA.test(value);
const INVENTORY = new URL('../sdk-extraction-inventory.json', import.meta.url);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function safePath(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(value) &&
    value.split('/').every(part => part !== '.' && part !== '..');
}
function uniqueStrings(values) {
  return Array.isArray(values) && values.every(value => typeof value === 'string' && ID.test(value)) &&
    new Set(values).size === values.length;
}
function fail(message) { throw new TypeError(`Extraction inventory: ${message}`); }

export function validateInventory(data) {
  if (!record(data) || data.schemaVersion !== 1 || !record(data.source) ||
      data.source.repository !== SOURCE || !validSha(data.source.commit) ||
      data.reviewLevel !== 'declared-dependencies-only' || data.publicationAllowed !== false) {
    fail('invalid header or unsupported readiness claim');
  }
  if (!Array.isArray(data.evidence) || data.evidence.length < 1 || data.evidence.length > 200 ||
      !Array.isArray(data.units) || data.units.length < 1 || data.units.length > 100 ||
      !uniqueStrings(data.roots) || data.roots.length === 0 || !uniqueStrings(data.sharedInputs) ||
      !Array.isArray(data.blockers) || data.blockers.length === 0 ||
      data.blockers.some(value => typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value))) {
    fail('invalid collections or missing review blockers');
  }
  const evidence = new Map();
  const evidencePaths = new Set();
  for (const input of data.evidence) {
    if (!record(input) || !validId(input.id) || !safePath(input.path) ||
        !['tree', 'blob'].includes(input.kind) || !validSha(input.sha) ||
        evidence.has(input.id) || evidencePaths.has(input.path)) fail('invalid or duplicate source evidence');
    evidence.set(input.id, input); evidencePaths.add(input.path);
  }
  const units = new Map();
  const paths = new Set();
  for (const unit of data.units) {
    if (!record(unit) || !validId(unit.id) || !safePath(unit.path) ||
        !/^(packages|crates)\/[a-zA-Z0-9_.-]+$/.test(unit.path) ||
        !uniqueStrings(unit.dependencies) || !uniqueStrings(unit.evidence) || !unit.evidence.length ||
        units.has(unit.id) || paths.has(unit.path)) fail('invalid or duplicate extraction unit');
    for (const ref of unit.evidence) if (!evidence.has(ref)) fail('unresolved evidence reference');
    units.set(unit.id, unit); paths.add(unit.path);
  }
  for (const ref of data.sharedInputs) if (!evidence.has(ref)) fail('unresolved shared input');
  const used = new Set([...data.sharedInputs, ...data.units.flatMap(unit => unit.evidence)]);
  if (used.size !== evidence.size) fail('unused source evidence');
  const active = new Set();
  const done = new Set();
  const order = [];
  function visit(id) {
    if (!units.has(id)) fail('unresolved unit dependency');
    if (active.has(id)) fail('cyclic unit dependency');
    if (done.has(id)) return;
    active.add(id);
    for (const dependency of [...units.get(id).dependencies].sort()) visit(dependency);
    active.delete(id); done.add(id); order.push(id);
  }
  for (const root of [...data.roots].sort()) visit(root);
  if (done.size !== units.size) fail('units outside declared root closure');
  return { data, order };
}

export function inventoryReport(input) {
  const { data, order } = validateInventory(input);
  return {
    source: data.source,
    reviewLevel: data.reviewLevel,
    publicationAllowed: false,
    evidenceCount: data.evidence.length,
    dependencyOrder: order,
    blockers: [...data.blockers],
  };
}

function git(directory, args) {
  // Ignore Git environment redirection and global configuration. Never print raw
  // status/command output: the authorized private checkout can contain private paths.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const result = spawnSync('git', ['--no-pager', '--no-replace-objects', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${devNull}`, '-C', directory, ...args], {
    encoding: 'utf8', shell: false, timeout: 10000, maxBuffer: 1024 * 1024,
    env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.status !== 0) throw new Error('Source inspection failed; check local Git access. No source content is printed.');
  return result.stdout;
}

export function verifySource(input, directory) {
  const { data } = validateInventory(input);
  if (typeof directory !== 'string' || !directory.trim()) fail('missing source directory');
  const root = resolve(directory);
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  if (head !== data.source.commit) throw new Error('Source revision differs from the reviewed inventory');
  // Worktree inspection can invoke a configured clean filter. Reject such
  // configuration before status; the inventory checker must not run source code.
  const configuration = git(root, ['config', '--includes', '--null', '--list']);
  if (configuration.split('\0').some(entry => /^(filter\.|diff\.external\n|diff\..+\.textconv\n)/i.test(entry))) {
    throw new Error('Source checkout has external Git filters; inspect a clean configuration without executing them');
  }
  if (git(root, ['status', '--porcelain', '--untracked-files=all']).trim()) {
    throw new Error('Source checkout must be clean, including untracked files');
  }
  for (const input of data.evidence) {
    const entry = git(root, ['ls-tree', '--full-tree', data.source.commit, '--', input.path]).trim();
    const match = /^(100644|100755|040000) (blob|tree) ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (!match || match[2] !== input.kind || match[3] !== input.sha || match[4] !== input.path) {
      throw new Error(`Source evidence mismatch: ${input.id}`);
    }
  }
  // Detect a branch/index/worktree change during inspection. This is a read-only
  // preflight, not a lock, snapshot copy or guarantee about a future extraction.
  if (git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim() !== head ||
      git(root, ['status', '--porcelain', '--untracked-files=all']).trim()) {
    throw new Error('Source changed during inspection');
  }
  return { ...inventoryReport(data), sourceVerified: true, verifiedInputs: data.evidence.length };
}

export function parseArgs(args) {
  if (!args.length) return { mode: 'report' };
  if (args.length === 1 && args[0] === '--check') return { mode: 'check' };
  if (args.length === 2 && args[0] === '--source' && args[1].trim() && !args[1].startsWith('--')) {
    return { mode: 'source', directory: args[1] };
  }
  throw new Error('Usage: check-extraction.mjs [--check|--source LOCAL_CHECKOUT]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const data = JSON.parse(await readFile(INVENTORY, 'utf8'));
    const report = args.mode === 'source' ? verifySource(data, args.directory) : inventoryReport(data);
    console.log(args.mode === 'check'
      ? `Extraction metadata verified: ${report.dependencyOrder.length} units, ${report.evidenceCount} pinned inputs. Full-source review and cutover are pending.`
      : JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
