import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir, devNull } from 'node:os';
import { join } from 'node:path';
import { validateInventory, inventoryReport, verifySource, parseArgs } from '../scripts/check-extraction.mjs';

const inventory = JSON.parse(await readFile(new URL('../sdk-extraction-inventory.json', import.meta.url), 'utf8'));

test('real inventory has nine reachable units, 16 inputs and explicit review limitations', () => {
  const report = inventoryReport(inventory);
  assert.equal(report.dependencyOrder.length, 9);
  assert.equal(report.evidenceCount, 16);
  assert.equal(report.dependencyOrder.at(-1), 'sdk');
  assert.equal(report.publicationAllowed, false);
  assert.equal(report.reviewLevel, 'declared-dependencies-only');
  for (const unit of inventory.units) for (const dependency of unit.dependencies) {
    assert.ok(report.dependencyOrder.indexOf(dependency) < report.dependencyOrder.indexOf(unit.id));
  }
});

test('dependency ordering is deterministic and validation does not mutate inventory', () => {
  const before = JSON.stringify(inventory);
  const reversed = structuredClone(inventory);
  reversed.units.reverse();
  reversed.evidence.reverse();
  for (const unit of reversed.units) unit.dependencies.reverse();
  assert.deepEqual(inventoryReport(reversed), inventoryReport(inventory));
  assert.equal(JSON.stringify(inventory), before);
});

for (const [label, mutate] of [
  ['unapproved source repository', data => { data.source.repository = 'someone/else'; }],
  ['unversioned source', data => { data.source.commit = 'main'; }],
  ['unsupported readiness claim', data => { data.publicationAllowed = true; }],
  ['missing review blockers', data => { data.blockers = []; }],
  ['path traversal', data => { data.evidence[0].path = '../private'; }],
  ['Git option path', data => { data.evidence[0].path = '--upload-pack=x'; }],
  ['duplicate evidence', data => { data.evidence.push(data.evidence[0]); }],
  ['duplicate units', data => { data.units.push(data.units[0]); }],
  ['missing dependency', data => { data.units[0].dependencies = ['missing']; }],
  ['cyclic dependency', data => { data.units[2].dependencies = ['sdk']; }],
  ['unknown evidence reference', data => { data.units[0].evidence = ['missing']; }],
  ['unused evidence', data => { data.evidence.push({ id: 'unused', path: 'extra.json', kind: 'blob', sha: 'a'.repeat(40) }); }],
  ['unreachable unit', data => { data.units.push({ id: 'unused', path: 'packages/unused', dependencies: [], evidence: ['sdk'] }); }],
  ['private app extraction target', data => { data.units[0].path = 'apps/edge'; }],
]) {
  test(`inventory rejects ${label}`, () => {
    const data = structuredClone(inventory); mutate(data);
    assert.throws(() => validateInventory(data));
  });
}

test('invalid CLI options cannot request mutation', () => {
  assert.deepEqual(parseArgs([]), { mode: 'report' });
  assert.deepEqual(parseArgs(['--check']), { mode: 'check' });
  assert.deepEqual(parseArgs(['--source', '/some/local/clone']), { mode: 'source', directory: '/some/local/clone' });
  for (const args of [['--publish'], ['--source'], ['--source', '--check'], ['--check', '--apply']]) {
    assert.throws(() => parseArgs(args), /Usage/);
  }
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'nekon-extraction-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['-c', `core.hooksPath=${devNull}`, '-C', root, ...args], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git(['init', '--quiet']);
  git(['config', 'user.name', 'Synthetic fixture']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  await mkdir(join(root, 'packages/sdk'), { recursive: true });
  await writeFile(join(root, 'packages/sdk/index.ts'), 'export const synthetic = true;\n');
  await writeFile(join(root, 'Cargo.toml'), '[workspace]\nmembers = []\n');
  git(['add', '.']); git(['-c', 'commit.gpgSign=false', 'commit', '--quiet', '-m', 'Synthetic fixture']);
  const sourceCommit = git(['rev-parse', 'HEAD']);
  const data = {
    schemaVersion: 1, source: { repository: 'powerpuff-kitty/nekon', commit: sourceCommit },
    reviewLevel: 'declared-dependencies-only', publicationAllowed: false,
    evidence: [
      { id: 'sdk', path: 'packages/sdk', kind: 'tree', sha: git(['rev-parse', 'HEAD:packages/sdk']) },
      { id: 'cargo', path: 'Cargo.toml', kind: 'blob', sha: git(['rev-parse', 'HEAD:Cargo.toml']) },
    ],
    roots: ['sdk'], sharedInputs: ['cargo'],
    units: [{ id: 'sdk', path: 'packages/sdk', dependencies: [], evidence: ['sdk'] }],
    blockers: ['Synthetic fixture only; source-import and security review still pending.'],
  };
  return { root, git, data };
}

test('source verification inspects real Git objects without changing a clean fixture', async t => {
  const { root, git, data } = await fixture(t);
  const before = git(['rev-parse', 'HEAD']);
  const result = verifySource(data, root);
  assert.equal(result.sourceVerified, true);
  assert.equal(result.verifiedInputs, 2);
  assert.equal(result.publicationAllowed, false);
  assert.equal(git(['rev-parse', 'HEAD']), before);
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']), '');
});

test('source verification rejects wrong revision and mismatched object hashes', async t => {
  const { root, data } = await fixture(t);
  const changed = structuredClone(data); changed.source.commit = 'f'.repeat(40);
  assert.throws(() => verifySource(changed, root), /revision differs/);
  data.evidence[0].sha = 'e'.repeat(40);
  assert.throws(() => verifySource(data, root), /evidence mismatch/);
});

test('source verification rejects modified and untracked files without echoing contents', async t => {
  const { root, data } = await fixture(t);
  await writeFile(join(root, 'packages/sdk/index.ts'), 'synthetic changed content');
  assert.throws(() => verifySource(data, root), /^Error: Source checkout must be clean/);
  await writeFile(join(root, 'packages/sdk/index.ts'), 'export const synthetic = true;\n');
  await writeFile(join(root, 'untracked'), 'synthetic untracked content');
  assert.throws(() => verifySource(data, root), /^Error: Source checkout must be clean/);
});

test('source verification rejects missing paths and symlink blob entries', async t => {
  const { root, git, data } = await fixture(t);
  data.evidence[1].path = 'missing.json';
  assert.throws(() => verifySource(data, root), /evidence mismatch/);
  await symlink('Cargo.toml', join(root, 'link.toml'));
  git(['add', 'link.toml']); git(['-c', 'commit.gpgSign=false', 'commit', '--quiet', '-m', 'Synthetic symlink']);
  data.source.commit = git(['rev-parse', 'HEAD']);
  data.evidence[1] = { id: 'cargo', path: 'link.toml', kind: 'blob', sha: git(['rev-parse', 'HEAD:link.toml']) };
  assert.throws(() => verifySource(data, root), /evidence mismatch/);
});

test('source verification rejects external Git filters before worktree inspection', async t => {
  const { root, git, data } = await fixture(t);
  git(['config', 'filter.synthetic.clean', 'must-not-execute']);
  assert.throws(() => verifySource(data, root), /external Git filters/);
});
