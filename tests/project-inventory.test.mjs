import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoadmap, issueUrl } from '../scripts/roadmap.mjs';
import { readMembership, syncProject } from '../scripts/sync-project.mjs';

const awaitedRoadmap = await loadRoadmap();
const inventory = item => ({ items: [item], totalCount: 1 });
for (const [name, item] of [
  ['missing content', {}],
  ['null content', { content: null }],
  ['unknown type', { content: { type: 'Unknown', url: issueUrl(1) } }],
  ['missing type', { content: { url: issueUrl(1) } }],
  ['empty URL', { content: { type: 'Issue', url: '' } }],
  ['wrong URL kind', { content: { type: 'Issue', url: 'https://github.com/owner/repo/pull/1' } }],
  ['credentials in URL', { content: { type: 'Issue', url: 'https://secret@github.com/owner/repo/issues/1' } }],
  ['draft with URL', { content: { type: 'DraftIssue', url: issueUrl(1) } }],
]) {
  test(`Project inventory rejects ${name} before any write`, () => {
    assert.throws(() => readMembership(inventory(item)), /refusing ambiguous writes/);
    let writes = 0;
    assert.throws(() => syncProject(awaitedRoadmap, 'apply', args => {
      if (args[1] === 'item-list') return inventory(item);
      writes++; return { id: 'unexpected' };
    }));
    assert.equal(writes, 0);
  });
}

test('Project inventory rejects duplicate content URLs', () => {
  const item = { content: { type: 'Issue', url: issueUrl(1) } };
  assert.throws(() => readMembership({ items: [item, item], totalCount: 2 }), /duplicate/);
});
test('Project inventory preserves unrelated valid issues, PRs and explicit drafts', () => {
  const urls = readMembership({ items: [
    { content: { type: 'Issue', url: issueUrl(1) } },
    { content: { type: 'PullRequest', url: 'https://github.com/another-owner/another-repo/pull/2' } },
    { content: { type: 'DraftIssue' } },
  ], totalCount: 3 });
  assert.equal(urls.size, 2);
});
