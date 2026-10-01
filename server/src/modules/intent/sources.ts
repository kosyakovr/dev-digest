import type { GitClient, GitHubClient, IntentSource, IntentUnresolvedReason, IssueMeta } from '@devdigest/shared';
import {
  MAX_BODY_CHARS,
  MAX_BRANCH_CHARS,
  MAX_COMMIT_CHARS,
  MAX_COMMITS,
  MAX_COMMITS_TOTAL_CHARS,
  MAX_DIFF_CHARS,
  MAX_FILES,
  MAX_FILES_CHARS,
  MAX_SPEC_BYTES,
  MAX_SPEC_CHARS,
  MAX_SPEC_TOTAL_CHARS,
  MAX_SPECS,
  MAX_TICKET_BODY_CHARS,
  MAX_TICKET_TITLE_CHARS,
  MAX_TICKETS,
  MAX_TITLE_CHARS,
  MAX_UNRESOLVED_LINKS,
} from './constants.js';
import {
  extractSpecRefs,
  extractTicketRefs,
  isSubstantiveBody,
  stripHtmlComments,
  truncate,
} from './helpers.js';
import type { GatherInput, GatheredSources, IntentBundle } from './types.js';

/**
 * L03 — source gathering (ring ②, no LLM). Collects every signal the classifier
 * may see and records, per source, whether it was `used` or why it was not.
 *
 * SECURITY: nothing here ever fetches a URL. Tickets go through the injected
 * `GitHubClient` (REST `issues.get`), specs through `GitClient.readFileAtRef`
 * (the object database at the PR head, after path canonicalisation). Any other
 * link is only recorded as `unresolved: external_not_fetched`.
 */

export interface SourcePorts {
  git: GitClient;
  github: () => Promise<GitHubClient>;
}

const used = (kind: IntentSource['kind'], ref: string | null = null): IntentSource => ({
  kind,
  ref,
  status: 'used',
  reason: null,
});
const unresolved = (
  kind: IntentSource['kind'],
  ref: string | null,
  reason: IntentUnresolvedReason,
): IntentSource => ({ kind, ref, status: 'unresolved', reason });

export async function gatherSources(
  ports: SourcePorts,
  input: GatherInput,
): Promise<GatheredSources> {
  const { repo, pull } = input;
  const sources: IntentSource[] = [];

  // ---- title / description / branch -----------------------------------------
  const title = truncate(pull.title.trim(), MAX_TITLE_CHARS);
  const cleanBody = truncate(stripHtmlComments(pull.body ?? '').trim(), MAX_BODY_CHARS);
  const branch = truncate(pull.branch, MAX_BRANCH_CHARS);
  if (title) sources.push(used('title'));
  if (cleanBody) sources.push(used('description'));

  // ---- tickets ------------------------------------------------------------------
  const tickets: IntentBundle['tickets'] = [];
  const linkText = `${title}\n${stripHtmlComments(pull.body ?? '')}`;
  const found = extractTicketRefs(linkText, repo);
  const unresolvedOther: IntentSource[] = [...found.unresolved];
  const ticketSources: IntentSource[] = [];
  const toFetch = found.refs.slice(0, MAX_TICKETS);
  for (const extra of found.refs.slice(MAX_TICKETS)) {
    ticketSources.push(unresolved('ticket', `#${extra.number}`, 'limit_reached'));
  }
  if (toFetch.length > 0) {
    let gh: GitHubClient | undefined;
    try {
      gh = await ports.github();
    } catch {
      gh = undefined;
    }
    for (const ref of toFetch) {
      const label = `#${ref.number}`;
      if (!gh) {
        ticketSources.push(unresolved('ticket', label, 'github_unavailable'));
        continue;
      }
      let issue: IssueMeta;
      try {
        issue = await gh.getIssue(repo, ref.number);
      } catch (err) {
        const status = (err as { status?: number }).status;
        ticketSources.push(unresolved('ticket', label, status === 404 ? 'not_found' : 'github_unavailable'));
        continue;
      }
      if (issue.is_pull_request) {
        ticketSources.push(unresolved('ticket', label, 'is_pull_request'));
        continue;
      }
      tickets.push({
        n: ref.number,
        title: truncate(issue.title ?? '', MAX_TICKET_TITLE_CHARS),
        body: truncate(stripHtmlComments(issue.body ?? '').trim(), MAX_TICKET_BODY_CHARS),
      });
      ticketSources.push(used('ticket', label));
    }
  }
  sources.push(...ticketSources);

  // ---- specs / plans / other links ---------------------------------------------------
  const specText = [stripHtmlComments(pull.body ?? ''), ...tickets.map((t) => t.body)].join('\n');
  const specRefs = extractSpecRefs(specText, repo);
  unresolvedOther.push(...specRefs.unresolved);

  const specs: IntentBundle['specs'] = [];
  const specSources: IntentSource[] = [];
  let fetchedHead = false;
  let totalChars = 0;
  for (const [i, path] of specRefs.paths.entries()) {
    if (i >= MAX_SPECS) {
      specSources.push(unresolved('spec', path, 'limit_reached'));
      continue;
    }
    const read = async () => {
      try {
        return await ports.git.readFileAtRef(repo, pull.headSha, path, MAX_SPEC_BYTES);
      } catch {
        return null;
      }
    };
    let res = await read();
    if (res === null && !fetchedHead) {
      fetchedHead = true;
      try {
        await ports.git.fetchPullHead(repo, pull.number);
      } catch {
        /* a missing remote / private repo only means "not found" */
      }
      res = await read();
    }
    if (res === null) {
      specSources.push(unresolved('spec', path, 'not_found'));
      continue;
    }
    if (res.bytes > MAX_SPEC_BYTES) {
      specSources.push(unresolved('spec', path, 'too_large'));
      continue;
    }
    if (res.text.includes('\0')) {
      specSources.push(unresolved('spec', path, 'unsupported_type'));
      continue;
    }
    const text = truncate(res.text.trim(), Math.min(MAX_SPEC_CHARS, MAX_SPEC_TOTAL_CHARS - totalChars));
    if (text === '') {
      specSources.push(unresolved('spec', path, res.text.trim() === '' ? 'not_found' : 'limit_reached'));
      continue;
    }
    totalChars += text.length;
    specs.push({ path, text });
    specSources.push(used('spec', path));
  }
  sources.push(...specSources);
  sources.push(...unresolvedOther.slice(0, MAX_UNRESOLVED_LINKS));

  // ---- commits / branch / files / diff -----------------------------------------------
  const commits: string[] = [];
  let commitChars = 0;
  for (const c of input.commits.slice(0, MAX_COMMITS)) {
    const line = truncate(c.message.trim(), MAX_COMMIT_CHARS);
    if (!line || commitChars + line.length > MAX_COMMITS_TOTAL_CHARS) break;
    commits.push(line);
    commitChars += line.length;
  }
  if (commits.length > 0) sources.push(used('commits'));
  if (branch) sources.push(used('branch'));

  const files: string[] = [];
  let fileChars = 0;
  for (const f of input.files.slice(0, MAX_FILES)) {
    const line = `${f.path} (+${f.additions}/-${f.deletions})`;
    if (fileChars + line.length > MAX_FILES_CHARS) break;
    files.push(line);
    fileChars += line.length;
  }
  if (files.length > 0) sources.push(used('files'));
  const diffExcerpt = truncate(input.diffText, MAX_DIFF_CHARS);
  if (diffExcerpt) sources.push(used('diff'));

  return {
    bundle: { title, body: cleanBody, branch, commits, tickets, specs, files, diffExcerpt },
    sources,
    flags: {
      ticket: tickets.length > 0,
      spec: specs.length > 0,
      substantiveBody: isSubstantiveBody(pull.body),
    },
  };
}
