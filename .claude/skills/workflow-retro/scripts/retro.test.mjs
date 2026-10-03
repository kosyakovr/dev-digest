// Self-test for retro.mjs: a synthetic session with planted problems, each detector
// asserted both ways (a planted hit must appear, a planted non-hit must not).
//   node --test .claude/skills/workflow-retro/scripts/*.test.mjs
// (a bare directory argument fails on Node 26 with MODULE_NOT_FOUND)
// Runs in a throwaway HOME; touches nothing in the repo or ~/.claude.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stripHeredocs, shellWrites, shellRemovals, bashReads, isFullSuiteRun } from './shell.mjs';

const SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname), 'retro.mjs');
const T0 = Date.parse('2026-10-01T10:00:00Z');
const at = (min) => new Date(T0 + min * 60_000).toISOString();

const usage = { input_tokens: 2, output_tokens: 100, cache_read_input_tokens: 9000, cache_creation_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 0 } };
let n = 0;
const asst = (min, content, model = 'claude-sonnet-5-5', final = true) => ({ type: 'assistant', timestamp: at(min), message: { id: `msg_${++n}`, model, stop_reason: final ? 'tool_use' : null, usage: final ? usage : { ...usage, output_tokens: 16 }, content } });
const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
const res = (min, id, text, err = false) => ({ type: 'user', timestamp: at(min), message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: err }] } });
const human = (min, text) => ({ type: 'user', origin: { kind: 'human' }, timestamp: at(min), message: { content: text } });
const handback = (min, id, msg) => asst(min, [use(id, 'SubagentHandback', { message: msg })]);

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'devdigest-retro-test-'));
  const proj = path.join(home, 'proj');
  const P = (r) => path.join(proj, r);
  const agentDef = (name, hook) => `---\nname: ${name}\ntools: Read, Bash${hook === 'read-only' ? '' : ', Edit, Write'}\nhooks:\n  - command: "\\"$CLAUDE_PROJECT_DIR/.claude/hooks/${hook === 'implementer' ? 'implementer-guard.sh' : `agent-scope-guard.sh\\" ${hook}`}"\n---\nbody\n`;
  fs.mkdirSync(P('.claude/agents'), { recursive: true });
  for (const [name, hook] of [['spec-creator', 'spec-creator'], ['implementation-planner', 'read-only'], ['implementer', 'implementer'], ['test-writer', 'test-writer'], ['plan-verifier', 'read-only'], ['architecture-reviewer', 'read-only']])
    fs.writeFileSync(P(`.claude/agents/${name}.md`), agentDef(name, hook));
  fs.mkdirSync(P('docs/retros'), { recursive: true });
  fs.writeFileSync(P('docs/retros/ledger.md'), '# Ledger\n\n| a |\n|---|\n');

  const sid = 'aaaaaaaa-0000-0000-0000-000000000001';
  const tdir = path.join(home, '.claude', 'projects', proj.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(path.join(tdir, sid, 'subagents'), { recursive: true });
  const write = (f, entries) => fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const spawn = (min, id, type, prompt = 'go') => asst(min, [use(id, 'Agent', { subagent_type: type, description: type, prompt, run_in_background: true })], 'claude-opus-5-5');

  write(path.join(tdir, `${sid}.jsonl`), [
    human(0, 'build feature X'),
    spawn(0.2, 'sp0', 'spec-creator'),
    spawn(1, 'sp1', 'implementation-planner', 'x'.repeat(9000)),            // planted: >8k delegation prompt
    spawn(12, 'sp2', 'implementer'),                           // planted: no human turn after the plan
    spawn(30, 'sp3', 'test-writer'),
    spawn(45, 'sp4', 'plan-verifier'),
    spawn(52, 'sp5', 'architecture-reviewer'),                 // planted: reviewers run one after another
    spawn(60, 'sp6', 'plan-verifier'),                         // planted: verifier spawned fresh twice
    asst(70, [use('m1', 'Read', { file_path: `/tmp/claude-501/x/${sid}/tasks/abc.output` })], 'claude-opus-5-5'), // planted: rule 9
    res(70, 'm1', 'report text'),
    // non-hit: a planted one-sided vendored file, removed in the same command
    asst(71, [use('m2', 'Bash', { command: 'printf "x" > client/src/vendor/shared/tmp.ts && rm client/src/vendor/shared/tmp.ts' })], 'claude-opus-5-5'),
    res(71, 'm2', ''),
  ]);
  const sub = (id, type, toolUseId, entries) => {
    write(path.join(tdir, sid, 'subagents', `agent-${id}.jsonl`), [{ type: 'user', timestamp: entries[0].timestamp, message: { content: 'task' } }, ...entries]);
    fs.writeFileSync(path.join(tdir, sid, 'subagents', `agent-${id}.meta.json`), JSON.stringify({ agentType: type, toolUseId }));
  };
  sub('aspec0000001', 'spec-creator', 'sp0', [
    asst(0.3, [use('s1', 'Write', { file_path: P('docs/specs/L05-x.md') })], 'claude-opus-5-5'), res(0.3, 's1', 'ok'),            // non-hit: its own spec, and not "docs updated"
    asst(0.4, [use('s2', 'Edit', { file_path: P('client/src/app/page.tsx') })], 'claude-opus-5-5'), res(0.4, 's2', 'ok'),        // planted: outside the spec folders
    handback(0.8, 's3', '# Spec Report: X\nStatus: ready to plan'),
  ]);
  sub('aplanner0001', 'implementation-planner', 'sp1', [
    asst(2, [use('p1', 'Read', { file_path: P('server/INSIGHTS.md') })], 'claude-opus-5-5'), res(2, 'p1', 'insights'),
    asst(3, [use('p2', 'Read', { file_path: P('server/src/modules/a/service.ts') })], 'claude-opus-5-5'), res(3, 'p2', 'S'.repeat(4000)),
    handback(10, 'p3', '# Plan\nWP1: `server/src/modules/a/service.ts`'),
  ]);
  sub('aimplem00001', 'implementer', 'sp2', [
    asst(13, [use('i1', 'Bash', { command: 'cd server && cat src/modules/a/service.ts' })]), res(13, 'i1', 'S'.repeat(4000)), // same file via cd
    asst(14, [use('i2', 'Edit', { file_path: P('server/src/modules/a/service.ts') })]), res(14, 'i2', 'ok'), // planted: no server/INSIGHTS.md read
    asst(15, [use('i3', 'Edit', { file_path: P('server/src/vendor/shared/contracts/x.ts') })], 'claude-sonnet-5-5', false), res(15, 'i3', 'ok'), // planted: one-sided twin, unplanned; partial usage line
    asst(16, [use('i4', 'Write', { file_path: P('server/test/a.test.ts') })]), res(16, 'i4', 'ok'), // planted: implementer wrote a test
    // planted: two production files written through the shell; the heredoc bodies mention
    // `pnpm test` and a `>` that are data, not a test run or a redirect
    asst(17, [use('i6', 'Bash', { command: "cd server && python3 - <<'EOF'\np='src/modules/b/x.ts'\ns=open(p).read()\nopen(p,'w').write(s)\nprint('pnpm test')\nEOF" })]), res(17, 'i6', ''),
    asst(18, [use('i7', 'Bash', { command: "cat > client/src/lib/y.ts <<'EOF'\nexport const a = 1 > 0;\nEOF" })]), res(18, 'i7', ''), // planted: client/ edit, client/INSIGHTS.md never read
    handback(20, 'i5', '# Report\n## Insight candidates\n- the cache key ignores tenant\n## Done'),
  ]);
  sub('atestwr00001', 'test-writer', 'sp3', [
    asst(31, [use('t1', 'Read', { file_path: P('server/INSIGHTS.md') })]), res(31, 't1', 'insights'),
    asst(32, [use('t2', 'Read', { file_path: P('server/src/modules/a/service.ts') })]), res(32, 't2', 'S'.repeat(4000)),
    asst(33, [use('t3', 'Bash', { command: 'echo x > /tmp/f' })]), res(33, 't3', 'PreToolUse:Bash hook error: Agent scope guard (test-writer): shell writes are allowed only inside the red-proof worktree', true), // planted: denial
    asst(34, [use('t4', 'Write', { file_path: P('server/test/a.test.ts') })]), res(34, 't4', 'ok'), // non-hit: test-writer writing a test
    handback(40, 't5', '# Test Report'),
  ]);
  sub('averif000001', 'plan-verifier', 'sp4', [
    asst(46, [use('v1', 'Bash', { command: 'git diff > /tmp/d.txt' })], 'claude-opus-5-5'), res(46, 'v1', ''), // planted: read-only agent wrote through Bash
    handback(50, 'v2', 'NEEDS CLARIFICATION\n1. which plan?'),                                                 // planted: re-ask
  ]);
  sub('aarch0000001', 'architecture-reviewer', 'sp5', [
    asst(53, [use('r1', 'Bash', { command: 'git diff --stat 2>/dev/null' })], 'claude-opus-5-5'), res(53, 'r1', 'stat'), // non-hit: no write
    handback(58, 'r2', '# Architecture Review\nclean'),
  ]);
  sub('averif000002', 'plan-verifier', 'sp6', [handback(62, 'w1', '# Plan Verification\nPASS')]);
  return { home, proj, sid };
}

function run(fx, extra = []) {
  const out = execFileSync(process.execPath, [SCRIPT, '--session', fx.sid, '--project', fx.proj, '--json', path.join(fx.home, 'r.json'), ...extra],
    { env: { ...process.env, HOME: fx.home, CLAUDE_CODE_SESSION_ID: '' }, encoding: 'utf8' });
  return { out, json: JSON.parse(fs.readFileSync(path.join(fx.home, 'r.json'), 'utf8')) };
}

test('planted problems are found, planted non-problems are not', () => {
  const fx = fixture();
  const { json } = run(fx);
  const titles = json.findings.map((f) => `[${f.severity}] ${f.kind}: ${f.title}`);
  const has = (re) => assert.ok(titles.some((t) => re.test(t)), `missing ${re}\n${titles.join('\n')}`);
  const hasNot = (re) => assert.ok(!titles.some((t) => re.test(t)), `unexpected ${re}\n${titles.join('\n')}`);

  has(/\[crit\] scope: implementer#\w+ wrote outside its scope.*/);
  has(/\[crit\] scope: plan-verifier#averi wrote outside its scope \(read-only\)/);
  has(/\[crit\] scope: spec-creator#\w+ wrote outside its scope \(spec-creator\)/);
  assert.match(json.findings.find((f) => /spec-creator#\w+ wrote outside/.test(f.title)).evidence, /client\/src\/app\/page\.tsx \(spec-creator wrote outside the spec folders\)/);
  assert.doesNotMatch(json.findings.find((f) => /spec-creator#\w+ wrote outside/.test(f.title)).evidence, /docs\/specs/);
  has(/\[warn\] scope: test-writer#\w+: 1 denied call/);
  has(/\[crit\] skipped: vendored contract changed on one side only: server\/src\/vendor\/shared\/contracts\/x\.ts/);
  has(/\[info\] scope: implementer#\w+ edited 4 file\(s\) the plan does not name/); // vendor x.ts, a.test.ts + the two shell writes
  has(/\[warn\] scope: implementer#\w+ wrote 2 project file\(s\) through the shell \(3 via Edit\/Write\)/);
  // exactly these two — a `>` inside a heredoc body must not count as a write to "0;"
  assert.match(json.findings.find((f) => /through the shell/.test(f.title)).evidence, /^server\/src\/modules\/b\/x\.ts, client\/src\/lib\/y\.ts — /);
  has(/\[warn\] skipped: implementer#\w+ edited client\/ without reading client\/INSIGHTS\.md first/); // seen only through the shell write
  has(/\[warn\] skipped: implementer#\w+ edited server\/ without reading server\/INSIGHTS\.md first/);
  has(/\[warn\] skipped: INSIGHTS\.md not updated although agents reported Insight candidates/);
  has(/\[warn\] skipped: code changed but no docs were updated/);
  has(/\[warn\] skipped: implementer launched with no user turn after the plan/);
  has(/\[warn\] skipped: plan-verifier spawned fresh 2×/);
  has(/\[warn\] parallel: .*plan-verifier.*architecture-reviewer.* ran one after another/);
  has(/\[warn\] re-ask: plan-verifier#averi: 1 hand-back\(s\), 0 continuation\(s\), NEEDS CLARIFICATION/);
  has(/\[info\] skipped: implementation-planner#\w+ got a 9k-char delegation prompt/);
  has(/\[info\] skipped: main session read an agent transcript\/report directly/);
  has(/\[info\] re-read: server\/src\/modules\/a\/service\.ts read 3× by 3 thread/); // the `cd server && cat src/...` read resolves to the same file

  hasNot(/scope: test-writer#\w+ wrote outside/);
  hasNot(/test-writer#\w+ edited server\/ without reading/);
  hasNot(/architecture-reviewer#\w+/);
  hasNot(/implementer spawned fresh/);
  hasNot(/raw test\/typecheck runs/); // `pnpm test` appears only inside a heredoc
  hasNot(/vendor\/shared\/tmp\.ts/);  // written and removed → not a change
});

test('shell.mjs: heredoc bodies are data; writes and suite runs are recognised', () => {
  const R = '/repo';
  assert.equal(stripHeredocs("cat > a.ts <<'EOF'\nx > y\nEOF\necho done").bare, 'cat > a.ts __HEREDOC_0__\necho done');
  const w = (cmd) => shellWrites(cmd, R);
  assert.deepEqual(w("cat > a/b.ts <<'EOF'\nconst x = 1 > 0;\nEOF"), ['/repo/a/b.ts']);
  assert.deepEqual(w("cd server && python3 - <<'EOF'\np='src/x.ts'\nopen(p,'w').write('')\nEOF"), ['/repo/server/src/x.ts']);
  assert.deepEqual(w("python3 - <<'EOF'\nprint(open('src/x.ts').read())\nEOF"), []); // read only
  assert.deepEqual(w("pnpm test 2>&1 | tail -5; echo hi > /dev/null"), []);
  assert.deepEqual(w("sed -i '' 's/a/b/' docs/x.md"), ['/repo/docs/x.md']);
  assert.deepEqual(w('git diff > /tmp/d.txt'), ['/tmp/d.txt']);
  assert.deepEqual(w('grep -n "a > b" f.ts'), []); // quoted `>` is a pattern
  assert.deepEqual(w('cp /tmp/devdigest-redproof-1/x.ts server/src/x.ts'), ['/repo/server/src/x.ts']);
  // python: only paths that reach open(…,'w') are writes (false positives seen on 2026-10-03)
  assert.deepEqual(w("python3 - <<'EOF'\nspec=[{'file':'src/lib/hooks/blast.ts'}]\nopen('/tmp/devdigest-redproof-1/spec.json','w').write(str(spec))\nEOF"), ['/tmp/devdigest-redproof-1/spec.json']);
  assert.deepEqual(w("python3 - <<'EOF'\np='a.ts'\nadd=\"import x from '../platform/prompt-log.js'\"\nopen(p,'w').write(add)\nEOF"), ['/repo/a.ts']);
  assert.deepEqual(w("python3 - <<'EOF'\ndef sub(p, a, b):\n    s=open(p).read()\n    open(p,'w').write(s.replace(a,b))\nsub('src/x.ts','a','b')\nsub(\"src/y.ts\",'a','b')\nEOF"), ['/repo/src/x.ts', '/repo/src/y.ts']);
  assert.deepEqual(w("python3 - <<'EOF'\ndef sub(p,a,b):\n    open(p,'w').write(open(p).read().replace(a,b))\nD='app/_components/'\nsub('app/_components/' + 'Card.tsx','a','b')\nsub(D+'List.tsx','a','b')\nEOF"), []); // concatenated prefixes are skipped
  assert.deepEqual(w('cp a.ts $W/server/src/a.ts'), []); // unresolvable → skipped, not guessed
  assert.deepEqual(w('cp /tmp/x/Card.tsx "client/src/[id]/_components"'), ['/repo/client/src/[id]/_components/Card.tsx']); // into a directory
  assert.deepEqual(shellRemovals('mkdir -p d && printf "x" > d/f.ts && rm -r d', R), ['/repo/d']);
  assert.deepEqual(bashReads("python3 - <<'EOF'\ncat x.ts\nEOF", R), []);
  assert.deepEqual(bashReads('cd client && sed -n 1,20p src/a.tsx', R), ['/repo/client/src/a.tsx']);
  assert.equal(isFullSuiteRun('cd client && pnpm typecheck 2>&1 | tail -15'), true);
  assert.equal(isFullSuiteRun('cd mcp-server && pnpm test'), true);
  assert.equal(isFullSuiteRun('pnpm exec vitest run test/a.test.ts'), false);
  assert.equal(isFullSuiteRun("python3 - <<'EOF'\n# pnpm test\nEOF"), false);
  assert.equal(isFullSuiteRun('scripts/checks.sh --force --pkg server'), false);
  assert.equal(isFullSuiteRun('echo "pnpm test"'), false);
});

test('metrics: partial usage lines are estimated, cost and parallelism are computed', () => {
  const fx = fixture();
  const { json } = run(fx);
  const impl = json.agents.find((a) => a.type === 'implementer');
  assert.equal(impl.turns, 7);               // 6 tool calls + the hand-back
  assert.equal(impl.estimatedCalls, 1);            // the call with a mid-stream usage line only
  assert.equal(impl.usage.out, 700);               // 6 final × 100 + 1 estimated at their mean
  // sonnet-5-5: 7×2×$2 + 700×$10 + 7×9000×$0.20 + 7×1000×$2.50, per 1M tokens
  assert.ok(Math.abs(impl.cost - (28 + 7000 + 12600 + 17500) / 1e6) < 1e-9, String(impl.cost));
  assert.equal(json.parallel.peak, 1);             // the fixture runs every agent alone
});

test('ledger: one row per run, never twice', () => {
  const fx = fixture();
  const first = run(fx, ['--ledger', 'docs/retros/ledger.md', '--run', 'feature X', '--note', 'implementer.md → x']);
  assert.match(first.out, /ledger: appended/);
  const second = run(fx, ['--ledger', 'docs/retros/ledger.md']);
  assert.match(second.out, /already exists/);
  const rows = fs.readFileSync(path.join(fx.proj, 'docs/retros/ledger.md'), 'utf8').split('\n').filter((l) => l.includes('`aaaaaaaa@'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /\| feature X \| 7 \|/); // 7 spawns, spec-creator included
  assert.match(rows[0], /implementer\.md → x \|$/);
});
