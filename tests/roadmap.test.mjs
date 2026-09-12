import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoadmap, validateRoadmap, renderRoadmap, issueUrl } from '../scripts/roadmap.mjs';
import { parseMode, syncProject, readMembership } from '../scripts/sync-project.mjs';
const roadmap = await loadRoadmap();

test('roadmap includes umbrella and 30 work items with valid dependencies', () => {
  assert.equal(roadmap.items.length, 31);
  assert.match(renderRoadmap(roadmap), /membership is unverified/);
});
test('rejects duplicates, missing dependencies, cycles and wrong repository', () => {
  for (const mutate of [
    d => d.items.push(d.items[0]),
    d => { d.items[1].dependencies = [999]; },
    d => { d.items[1].dependencies = [3]; },
    d => { d.repository = 'someone/else'; },
  ]) { const d = structuredClone(roadmap); mutate(d); assert.throws(() => validateRoadmap(d)); }
});
test('rejects injected issue numbers and title line breaks', () => {
  assert.throws(() => issueUrl('1;rm'));
  const d = structuredClone(roadmap); d.items[0].title = 'bad\nrow';
  assert.throws(() => validateRoadmap(d));
});
test('dry run never invokes gh or requires credentials', () => {
  const result = syncProject(roadmap, 'dry-run', () => { throw new Error('must not execute'); });
  assert.equal(result.verified, false); assert.equal(result.issueUrls.length, 31);
  assert.equal(parseMode([]), 'dry-run'); assert.equal(parseMode(['--apply']), 'apply');
  assert.throws(() => parseMode(['--apply', '--dry-run']));
  assert.throws(() => parseMode(['--force']));
});
test('apply adds missing issues, preserves existing items and verifies membership', () => {
  const existing = new Set([issueUrl(1)]);
  const commands = [];
  const run = args => {
    commands.push(args);
    if (args[1] === 'item-list') return { totalCount: existing.size, items: [...existing].map(url => ({ content: { type: 'Issue', url } })) };
    assert.equal(args[1], 'item-add');
    const url = args[args.indexOf('--url') + 1]; existing.add(url);
    return { id: 'PVTI_mock' };
  };
  const result = syncProject(roadmap, 'apply', run);
  assert.equal(result.added.length, 30); assert.equal(result.verifiedCount, 31);
  assert.equal(syncProject(roadmap, 'apply', run).added.length, 0);
  assert.ok(commands.every(args => !args.includes('item-edit') && !args.includes('item-delete')));
});
test('incomplete or ambiguous Project reads fail closed', () => {
  for (const response of [{}, { items: [], totalCount: 1 }, { items: [{}] },
    { items: [{ content: { type: 'Issue' } }], totalCount: 1 }]) {
    assert.throws(() => readMembership(response));
  }
  assert.equal(readMembership({ items: [{ content: { type: 'DraftIssue' } }], totalCount: 1 }).size, 0);
});
test('apply fails rather than claiming success when verification finds missing issues', () => {
  const result = args => args[1] === 'item-list' ? { items: [], totalCount: 0 } : { id: 'PVTI_mock' };
  assert.throws(() => syncProject(roadmap, 'apply', result), /verification failed/);
});
test('apply stops on a failed write and is safe to rerun', () => {
  let writes = 0;
  assert.throws(() => syncProject(roadmap, 'apply', args => {
    if (args[1] === 'item-list') return { items: [], totalCount: 0 };
    writes++; throw new Error('denied');
  }), /denied/);
  assert.equal(writes, 1);
});
