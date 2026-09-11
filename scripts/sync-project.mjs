import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadRoadmap, validateRoadmap, issueUrl, PROJECT } from './roadmap.mjs';

const LIMIT = 1000;
const target = [String(PROJECT.number), '--owner', PROJECT.owner];
export function parseMode(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) return 'dry-run';
  if (args.length === 1 && args[0] === '--apply') return 'apply';
  throw new Error('Usage: sync-project.mjs [--dry-run|--apply]');
}

function gh(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8', shell: false, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' },
  });
  if (result.error || result.status !== 0) {
    // Do not echo raw tool output: it may contain account or authentication data.
    throw new Error(`GitHub CLI command failed (${result.error?.code ?? result.status}). Check gh installation, authentication and Project 14 access. No credentials are printed.`);
  }
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('GitHub CLI returned invalid JSON'); }
}

export function readMembership(response) {
  if (!response || !Array.isArray(response.items) || !Number.isSafeInteger(response.totalCount) ||
      response.totalCount !== response.items.length || response.items.length >= LIMIT) {
    throw new Error('Incomplete or invalid Project inventory; refusing writes');
  }
  const urls = new Set();
  for (const item of response.items) {
    const content = item?.content;
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !content || typeof content !== 'object' || Array.isArray(content)) {
      throw new Error('Invalid Project item; refusing ambiguous writes');
    }
    // Only an explicitly typed draft may omit an issue URL. Unknown/redacted
    // shapes are not evidence that an issue is missing from the board.
    if (content.type === 'DraftIssue') {
      if (content.url !== undefined && content.url !== null) {
        throw new Error('Unexpected draft content URL; refusing ambiguous writes');
      }
      continue;
    }
    const segment = content.type === 'Issue' ? 'issues' : content.type === 'PullRequest' ? 'pull' : null;
    const pattern = segment && new RegExp(`^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/${segment}/[1-9][0-9]*$`);
    if (!pattern || typeof content.url !== 'string' || !pattern.test(content.url) || urls.has(content.url)) {
      throw new Error('Invalid or duplicate Project content URL; refusing ambiguous writes');
    }
    urls.add(content.url);
  }
  return urls;
}

export function syncProject(data, mode, run = gh) {
  validateRoadmap(data);
  if (!['dry-run', 'apply'].includes(mode)) throw new Error('Invalid synchronization mode');
  const urls = data.items.map(item => issueUrl(item.issue));
  if (mode === 'dry-run') return { mode, owner: PROJECT.owner, project: PROJECT.number, issueUrls: urls, verified: false };
  const list = () => readMembership(run(['project', 'item-list', ...target, '--limit', String(LIMIT), '--format', 'json']));
  const existing = list();
  const added = [];
  for (const url of urls) {
    if (existing.has(url)) continue;
    const item = run(['project', 'item-add', ...target, '--url', url, '--format', 'json']);
    if (!item || typeof item.id !== 'string' || !item.id) throw new Error('Missing Project item ID; stop and rerun after inspecting the board');
    existing.add(url); added.push(url);
  }
  const confirmed = list();
  const missing = urls.filter(url => !confirmed.has(url));
  if (missing.length) throw new Error(`Project verification failed for ${missing.length} issues; rerun after checking access/indexing`);
  return { mode, owner: PROJECT.owner, project: PROJECT.number, added, verified: true, verifiedCount: urls.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(syncProject(await loadRoadmap(), parseMode(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
