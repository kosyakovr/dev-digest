#!/usr/bin/env node
// workflow-retro — metrics and problem detectors for one finished multi-agent run,
// read from Claude Code's own transcripts. Plain Node, no dependencies, read-only
// except for the one ledger row it appends when asked (--ledger).
//
//   node .claude/skills/workflow-retro/scripts/retro.mjs [options]
//
//   --session <id|prev>   transcript to read. Default: $CLAUDE_CODE_SESSION_ID (this
//                         session). `prev` = the newest OTHER session with subagents.
//   --since <ISO>         run window start (default: the previous retro in this
//                         session, else the session start)
//   --until <ISO>         run window end (default: this retro's invocation, else the end)
//   --json <file>         write every metric and finding as JSON (for the drill-down)
//   --ledger <file>       append one row to that markdown ledger (append-only: a row
//                         for the same session + window start is never written twice)
//   --run "<name>"        the run's name for the ledger row (feature / lesson)
//   --note "<text>"       the top action item, ≤ 80 chars, for the ledger row
//   --project <dir>       project root (default: cwd)
//
// The format notes this script depends on are in ../SKILL.md § Transcript format.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bashReads as bashReadsIn, shellWrites, shellRemovals, isFullSuiteRun } from './shell.mjs';

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) die(`unexpected argument ${a}`);
  const k = a.slice(2);
  const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  opt[k] = v;
}
function die(msg) { console.error(`workflow-retro: ${msg}`); process.exit(2); }

const PROJECT = path.resolve(opt.project || process.cwd());
const TRANSCRIPTS = path.join(os.homedir(), '.claude', 'projects', PROJECT.replace(/[^A-Za-z0-9]/g, '-'));
if (!fs.existsSync(TRANSCRIPTS)) die(`no transcript folder ${TRANSCRIPTS}`);

// ---------- prices ($ per 1M tokens) ----------
// Verified against the session `cost-state` record to the cent on 2026-10-03:
// output already includes thinking; a cache write costs 1.25× input on the 5-minute
// TTL and 2× input on the 1-hour TTL. Unknown model → cost null ("unknown", never 0).
const PRICES = [
  [/^claude-fable-5/, { in: 10, out: 50, read: 0.25 }],
  [/^claude-mythos-5/, { in: 10, out: 50, read: 0.25 }],
  [/^claude-opus-5-5/, { in: 4, out: 20, read: 0.20 }],
  [/^claude-opus-(5|4-[5-8])/, { in: 5, out: 25, read: 0.50 }],
  [/^claude-sonnet-5/, { in: 2, out: 10, read: 0.20 }],
  [/^claude-sonnet-4/, { in: 3, out: 15, read: 0.30 }],
  [/^claude-haiku-4-5/, { in: 1, out: 5, read: 0.10 }],
];
function priceOf(model) {
  const m = String(model || '').replace(/\[.*\]$/, '');
  for (const [re, p] of PRICES) if (re.test(m)) return p;
  return null;
}
function costOf(u, model) {
  const p = priceOf(model);
  if (!p) return null;
  const w5 = u.cw5 ?? u.cw, w1 = u.cw1 ?? 0;
  return (u.in * p.in + u.out * p.out + u.cr * p.read + w5 * p.in * 1.25 + w1 * p.in * 2) / 1e6;
}

// ---------- read ----------
function readJsonl(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn last line while the session writes */ }
  }
  return out;
}
function sessionHasAgents(id) {
  const d = path.join(TRANSCRIPTS, id, 'subagents');
  return fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.jsonl'));
}
function resolveSession() {
  const current = process.env.CLAUDE_CODE_SESSION_ID;
  if (opt.session && opt.session !== 'prev') return opt.session;
  if (opt.session === 'prev') {
    const ids = fs.readdirSync(TRANSCRIPTS).filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.slice(0, -6)).filter((id) => id !== current && sessionHasAgents(id))
      .sort((a, b) => mtime(b) - mtime(a));
    if (!ids.length) die('no other session with subagents');
    return ids[0];
  }
  if (current) return current;
  const ids = fs.readdirSync(TRANSCRIPTS).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -6));
  return ids.sort((a, b) => mtime(b) - mtime(a))[0];
}
function mtime(id) { return fs.statSync(path.join(TRANSCRIPTS, `${id}.jsonl`)).mtimeMs; }

const SESSION = resolveSession();
const MAIN_FILE = path.join(TRANSCRIPTS, `${SESSION}.jsonl`);
if (!fs.existsSync(MAIN_FILE)) die(`no transcript ${MAIN_FILE}`);
const mainAll = readJsonl(MAIN_FILE);

// ---------- helpers ----------
const ts = (e) => (e.timestamp ? Date.parse(e.timestamp) : NaN);
// `planner` is the name in transcripts recorded before the 2026-10-03 rename.
const isPlanner = (type) => type === 'implementation-planner' || type === 'planner';
const blocks = (e) => (Array.isArray(e?.message?.content) ? e.message.content : []);
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => b.text ?? (typeof b.content === 'string' ? b.content : '')).join('\n') : '');
function rel(p) {
  if (!p) return p;
  const r = p.startsWith(PROJECT + '/') ? p.slice(PROJECT.length + 1) : p;
  return r.replace(/^\.\//, '').replace(/^\/(private\/)?tmp\/claude-\d+\/[^/]+\/[\w-]+\/scratchpad\//, '<scratchpad>/');
}
const PKGS = ['server', 'client', 'reviewer-core', 'e2e', 'mcp-server'];
const pkgOf = (r) => PKGS.find((p) => r.startsWith(p + '/'));
const isTest = (r) => /\.test\.tsx?$|(^|\/)(server|reviewer-core|mcp-server)\/test\/|client\/src\/test\/|e2e\/specs\/.*\.flow\.json$/.test(r);
const isDoc = (r) => /\.md$/.test(r) && !/INSIGHTS\.md$/.test(r);
const isSpec = (r) => /^(docs|server|client|reviewer-core|mcp-server)\/specs\/[^/]+\.md$/.test(r);
const isCode = (r) => !!pkgOf(r) && /\/src\//.test(r) && !isTest(r) && !/\.md$/.test(r);

// ---------- the run window ----------
const retroMarks = [];
let lastSpawn = 0;
for (const e of mainAll) {
  if (e.type === 'assistant') for (const b of blocks(e)) {
    if (b.type === 'tool_use' && b.name === 'Skill' && /workflow-retro/.test(b.input?.skill || '')) retroMarks.push(ts(e));
    if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) lastSpawn = Math.max(lastSpawn, ts(e));
  }
  if (e.type === 'user' && e.origin?.kind === 'human' && /<command-name>\/?workflow-retro<\/command-name>/.test(textOf(e.message?.content))) retroMarks.push(ts(e));
}
retroMarks.sort((a, b) => a - b);
const lastMark = retroMarks.filter((t) => t > lastSpawn)[0];
const UNTIL = opt.until ? Date.parse(opt.until) : lastMark ?? Infinity;
const prevMark = retroMarks.filter((t) => t < (lastMark ?? Infinity) && t < lastSpawn).pop();
const SINCE = opt.since ? Date.parse(opt.since) : prevMark ?? -Infinity;
const inWin = (t) => Number.isFinite(t) && t >= SINCE && t < UNTIL;
const main = mainAll.filter((e) => inWin(ts(e)));

// ---------- per-thread metrics ----------
function threadMetrics(entries) {
  const calls = new Map(); // message.id → usage (max per field: one call is split over several lines and output grows)
  const tools = []; const results = new Map();
  let first = Infinity, last = -Infinity;
  for (const e of entries) {
    const t = ts(e);
    if (Number.isFinite(t) && (e.type === 'assistant' || e.type === 'user')) { first = Math.min(first, t); last = Math.max(last, t); }
    if (e.type === 'assistant') {
      const m = e.message || {};
      if (m.model && m.model !== '<synthetic>' && m.usage && m.id) {
        const u = m.usage, cc = u.cache_creation || {};
        const prev = calls.get(m.id) || { in: 0, out: 0, cr: 0, cw: 0, cw5: 0, cw1: 0, model: m.model, t, final: false };
        const mx = (a, b) => Math.max(a || 0, b || 0);
        calls.set(m.id, {
          ...prev, final: prev.final || m.stop_reason != null,
          in: mx(prev.in, u.input_tokens), out: mx(prev.out, u.output_tokens),
          cr: mx(prev.cr, u.cache_read_input_tokens), cw: mx(prev.cw, u.cache_creation_input_tokens),
          cw5: mx(prev.cw5, cc.ephemeral_5m_input_tokens), cw1: mx(prev.cw1, cc.ephemeral_1h_input_tokens),
        });
      }
      for (const b of blocks(e)) if (b.type === 'tool_use') tools.push({ id: b.id, name: b.name, input: b.input || {}, t });
    }
    if (e.type === 'user') for (const b of blocks(e)) {
      if (b.type === 'tool_result') results.set(b.tool_use_id, { err: b.is_error === true, text: textOf(b.content) || String(b.content ?? ''), t });
    }
  }
  const seen = new Set(); const uniq = tools.filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));
  const byTool = {}; for (const x of uniq) byTool[x.name] = (byTool[x.name] || 0) + 1;
  return {
    calls: [...calls.values()].sort((a, b) => a.t - b.t),
    start: first, end: last, tools: uniq, results, byTool, toolCount: uniq.length,
    errors: uniq.filter((x) => results.get(x.id)?.err).length,
  };
}

// A subagent transcript keeps the FINAL usage line (stop_reason set) for only some
// calls; the rest stop at a mid-stream snapshot whose output_tokens is ~16, i.e.
// before thinking and the answer were counted. Input and cache fields are complete
// either way. For a call without a final line the output is estimated as the mean
// output of final calls in the same thread (≥3 of them), else of all final calls on
// that model. Measured on 2026-10-03 (17-agent run): 59 of 70 test-writer calls had
// no final line; the main session had all 235.
function estimateOutputs(allThreads) {
  const byModel = {};
  for (const th of allThreads) for (const c of th.calls) if (c.final) (byModel[c.model] ||= []).push(c.out);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  for (const th of allThreads) {
    const own = th.calls.filter((c) => c.final).map((c) => c.out);
    th.estimatedCalls = 0;
    for (const c of th.calls) {
      if (c.final) continue;
      const pool = own.length >= 3 ? own : byModel[c.model] || [];
      if (!pool.length) continue;
      c.out = Math.max(c.out, Math.round(mean(pool)));
      c.est = true;
      th.estimatedCalls++;
    }
  }
}

function summarize(th) {
  const u = { in: 0, out: 0, cr: 0, cw: 0, cw5: 0, cw1: 0 }; let cost = 0, unknownCost = 0; const models = new Set();
  let peakCtx = 0, firstCr = null;
  for (const c of th.calls) {
    const cc = c.cw5 + c.cw1 === 0 ? { ...c, cw5: c.cw } : c; // no TTL breakdown → 5-minute price
    for (const k of Object.keys(u)) u[k] += cc[k];
    models.add(c.model.replace(/\[.*\]$/, ''));
    const k = costOf(cc, c.model);
    if (k === null) unknownCost++; else cost += k;
    peakCtx = Math.max(peakCtx, c.in + c.cr + c.cw);
    if (firstCr === null) firstCr = c.cr;
  }
  const inputAll = u.in + u.cr + u.cw;
  return Object.assign(th, {
    turns: th.calls.length, estimatedCalls: th.calls.filter((c) => c.est).length, models: [...models], usage: u, tokens: inputAll + u.out,
    cacheHit: inputAll ? u.cr / inputAll : null, firstTurnCacheRead: firstCr,
    cost: unknownCost && !cost ? null : cost, unknownCostCalls: unknownCost, peakCtx,
  });
}

// ---------- spawns (from the main transcript) ----------
const spawns = new Map(); // tool_use id → spawn
const sendTo = {};        // agentId → SendMessage count
for (const e of mainAll) if (e.type === 'assistant') for (const b of blocks(e)) {
  if (b.type !== 'tool_use') continue;
  if (b.name === 'Agent' || b.name === 'Task') spawns.set(b.id, {
    t: ts(e), type: b.input?.subagent_type || 'general-purpose', description: b.input?.description || '',
    promptChars: String(b.input?.prompt || '').length, background: b.input?.run_in_background !== false,
  });
  if (b.name === 'SendMessage') { const to = b.input?.to || b.input?.recipient; if (to) sendTo[to] = (sendTo[to] || 0) + 1; }
}
const notif = {}; // agentId → harness usage from <task-notification>
for (const e of mainAll) if (e.type === 'user') {
  const s = textOf(e.message?.content);
  for (const m of s.matchAll(/<task-id>([\w-]+)<\/task-id>[\s\S]*?<usage><subagent_tokens>(\d+)<\/subagent_tokens><tool_uses>(\d+)<\/tool_uses><duration_ms>(\d+)<\/duration_ms><\/usage>/g)) {
    const a = notif[m[1]] || (notif[m[1]] = { tokens: 0, toolUses: 0, durationMs: 0, count: 0 });
    a.tokens = +m[2]; a.toolUses = +m[3]; a.durationMs += +m[4]; a.count++;
  }
}

// ---------- agent profiles (from .claude/agents/*.md frontmatter, so they stay current) ----------
const PROFILES = {};
const agentsDir = path.join(PROJECT, '.claude', 'agents');
if (fs.existsSync(agentsDir)) for (const f of fs.readdirSync(agentsDir)) {
  if (!f.endsWith('.md') || f === 'README.md') continue;
  const src = fs.readFileSync(path.join(agentsDir, f), 'utf8');
  const fm = (src.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const name = (fm.match(/^name:\s*(\S+)/m) || [])[1] || f.slice(0, -3);
  const toolsLine = (fm.match(/^tools:\s*(.*)$/m) || [])[1] || '';
  let profile = (fm.match(/agent-scope-guard\.sh\\?"?\s+([\w-]+)/) || [])[1];
  if (!profile && /implementer-guard\.sh/.test(fm)) profile = 'implementer';
  if (!profile) profile = /\b(Edit|Write)\b/.test(toolsLine) ? 'unguarded' : 'read-only';
  PROFILES[name] = { profile, file: `.claude/agents/${f}`, guarded: /hooks:/.test(fm) };
}

// ---------- subagents ----------
const subDir = path.join(TRANSCRIPTS, SESSION, 'subagents');
const agents = []; const allSubs = []; // allSubs: every subagent of the session, for calibration
if (fs.existsSync(subDir)) for (const f of fs.readdirSync(subDir)) {
  if (!f.endsWith('.jsonl')) continue;
  const id = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
  const metaFile = path.join(subDir, f.replace(/\.jsonl$/, '.meta.json'));
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const entries = readJsonl(path.join(subDir, f));
  const m = threadMetrics(entries);
  allSubs.push(m);
  if (!inWin(m.start)) continue;
  const spawn = spawns.get(meta.toolUseId) || {};
  // Rounds: a continuation arrives as a user string "The coordinator sent a message…".
  const conts = entries.filter((e) => e.type === 'user' && typeof e.message?.content === 'string' && /^The coordinator sent a message/.test(e.message.content));
  const handbacks = m.tools.filter((x) => x.name === 'SubagentHandback').map((x) => String(x.input.message || x.input.report || ''));
  // Active time: the span minus the idle gaps before each continuation.
  let idle = 0;
  const times = entries.map(ts).filter(Number.isFinite).sort((a, b) => a - b);
  for (const c of conts) { const t = ts(c); const before = times.filter((x) => x < t).pop(); if (before) idle += t - before; }
  const rounds = []; let rs = m.start;
  for (const c of conts.map(ts).sort((a, b) => a - b)) { const before = times.filter((x) => x < c).pop(); if (before && before > rs) rounds.push([rs, before]); rs = c; }
  rounds.push([rs, m.end]);
  agents.push({
    id, type: meta.agentType || spawn.type || '?', description: meta.description || spawn.description || '',
    profile: PROFILES[meta.agentType]?.profile ?? (meta.agentType === 'general-purpose' ? 'none' : 'unknown'),
    agentFile: PROFILES[meta.agentType]?.file ?? null,
    spawnedAt: spawn.t, promptChars: spawn.promptChars ?? null, background: spawn.background ?? null,
    rounds, activeMs: m.end - m.start - idle, continuations: conts.length, sendMessages: sendTo[id] || 0,
    handbacks, notif: notif[id] || null, ...m,
  });
}
agents.sort((a, b) => a.start - b.start);
const mainM = threadMetrics(main);
const mainAllM = threadMetrics(mainAll);
estimateOutputs([mainAllM, ...allSubs]); // agents share call objects with allSubs
estimateOutputs([mainM]);
// Calibrate the estimated outputs per model against the harness's own `cost-state`
// record, but only when it is fresh (nothing was called after it was written). It
// also counts calls no transcript shows (compaction, auto-mode classifier, titles),
// so the calibrated figure is a slight over-estimate, never an under-estimate.
const calibration = {};
{
  const csIdx = mainAll.map((e) => e.type).lastIndexOf('cost-state');
  const cs = csIdx >= 0 ? mainAll[csIdx] : null;
  const csTime = cs ? Math.max(...mainAll.slice(0, csIdx).map(ts).filter(Number.isFinite)) : NaN;
  const fresh = cs && !mainAll.slice(csIdx + 1).some((e) => e.type === 'assistant')
    && !allSubs.some((s) => s.calls.some((c) => c.t > csTime + 60_000));
  if (fresh) for (const [model, mu] of Object.entries(cs.modelUsage || {})) {
    const key = model.replace(/\[.*\]$/, '');
    const calls = [mainAllM, ...allSubs].flatMap((t) => t.calls).filter((c) => c.model.replace(/\[.*\]$/, '') === key);
    const have = calls.filter((c) => !c.est).reduce((s, c) => s + c.out, 0);
    const est = calls.filter((c) => c.est).reduce((s, c) => s + c.out, 0);
    if (!est || mu.outputTokens <= have) continue;
    const f = (mu.outputTokens - have) / est;
    for (const c of calls) if (c.est) c.out = Math.round(c.out * f);
    calibration[key.replace(/^claude-/, '')] = f;
  }
}
[mainM, ...agents].forEach(summarize);
const estimated = { calls: [mainM, ...agents].reduce((s, t) => s + t.estimatedCalls, 0), of: [mainM, ...agents].reduce((s, t) => s + t.calls.length, 0) };

// ---------- parallelism ----------
const intervals = agents.flatMap((a) => a.rounds.map(([s, e]) => ({ s, e, id: a.id }))).filter((x) => x.e > x.s);
let peak = 0, union = 0, sum = 0;
{
  const ev = intervals.flatMap((x) => [[x.s, 1], [x.e, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, lastT = null;
  for (const [t, d] of ev) { if (cur > 0 && lastT !== null) union += t - lastT; cur += d; peak = Math.max(peak, cur); lastT = t; }
  sum = intervals.reduce((s, x) => s + (x.e - x.s), 0);
}
const wallStart = Math.min(mainM.start, ...agents.map((a) => a.start));
const wallEnd = Math.max(mainM.end, ...agents.map((a) => a.end));
const parallel = { peak, avg: union ? sum / union : 0, agentBusyMs: union, wallMs: wallEnd - wallStart };

// ---------- findings ----------
const findings = [];
const add = (kind, severity, title, evidence, target) => {
  const same = findings.find((f) => f.kind === kind && f.title === title);
  if (same) { same.count = (same.count || 1) + 1; return; } // one finding per problem, with a count
  findings.push({ kind, severity, title, evidence, target });
};
const threads = [{ id: 'main', type: 'main', agentFile: null, ...mainM }, ...agents];
const label = (th) => (th.id === 'main' ? 'main' : `${th.type}#${th.id.slice(0, 5)}`);

// 1. Files read by several agents, or by one agent again and again.
// The shell starts in the project root on every call; scripts/shell.mjs resolves
// `cd pkg && cat src/x.ts` to pkg/src/x.ts and ignores heredoc bodies.
const bashReads = (cmd) => bashReadsIn(cmd, PROJECT);
const reads = new Map(); // file → [{thread, chars}]
for (const th of threads) for (const x of th.tools) {
  const files = x.name === 'Read' ? [x.input.file_path] : x.name === 'Bash' ? bashReads(x.input.command) : [];
  for (const f of files) {
    if (!f) continue;
    const r = rel(f);
    if (/\/tasks\/[\w-]+\.output$|\/subagents\/|tool-results\//.test(r)) continue; // counted under rule 9
    const chars = (th.results.get(x.id)?.text || '').length;
    (reads.get(r) || reads.set(r, []).get(r)).push({ thread: label(th), chars });
  }
}
const reRead = [];
for (const [file, rs] of reads) {
  const by = {}; for (const r of rs) by[r.thread] = (by[r.thread] || 0) + 1;
  const nThreads = Object.keys(by).length;
  if (nThreads < 2 && rs.length < 3) continue;
  const wasted = rs.reduce((s, r) => s + r.chars, 0) - Math.max(...rs.map((r) => r.chars));
  reRead.push({ file, reads: rs.length, threads: by, wastedTokens: Math.round(wasted / 4) });
}
reRead.sort((a, b) => b.wastedTokens - a.wastedTokens);
for (const r of reRead.slice(0, 8)) add('re-read', 'info', `${r.file} read ${r.reads}× by ${Object.keys(r.threads).length} thread(s)`,
  `${Object.entries(r.threads).map(([k, v]) => `${k}×${v}`).join(', ')} · ≈${r.wastedTokens} tokens of repeat reads`,
  /^\.claude\/skills\//.test(r.file) ? 'implementation-planner.md (quote the binding § in the plan) or the reading agents' : '.claude/agents/README.md § Token budget (pass the path/excerpt once)');

// 2. Who went back to the orchestrator.
for (const a of agents) {
  const statuses = a.handbacks.map((h) => (h.match(/\b(NEEDS CLARIFICATION|BLOCKED)\b/) || [])[1]).filter(Boolean);
  if (statuses.length || a.continuations || a.handbacks.length > 1) add('re-ask', statuses.length ? 'warn' : 'info',
    `${label(a)}: ${a.handbacks.length} hand-back(s), ${a.continuations} continuation(s)${statuses.length ? `, ${statuses.join(' + ')}` : ''}`,
    statuses.length ? `stopped with ${statuses.join(', ')} — first line: "${(a.handbacks.find((h) => /NEEDS CLARIFICATION|BLOCKED/.test(h)) || '').split('\n').find((l) => /NEEDS|BLOCKED/.test(l))?.slice(0, 140)}"` : 'continued via SendMessage (re-review or follow-up round)',
    a.agentFile || 'the delegation prompt in the main session');
}

// Every file write that went through: Edit/Write, and Bash writes (`cat > f <<EOF`,
// redirects, tee, sed -i, cp/mv, python heredocs opening a path for writing). The
// guards' path rules see only Edit/Write, so a shell write is also a finding below.
const edits = []; // {thread, file, t, via: 'tool' | 'bash'}
for (const th of threads) for (const x of th.tools) {
  if (th.results.get(x.id)?.err) continue; // denied or failed → not a write
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(x.name)) edits.push({ thread: th, file: rel(x.input.file_path || x.input.notebook_path || ''), t: x.t, via: 'tool' });
  if (x.name === 'Bash') for (const f of shellWrites(x.input.command, PROJECT)) edits.push({ thread: th, file: rel(f), t: x.t, via: 'bash' });
}
// A file the same thread removed afterwards (or in the same command) was a temporary
// one — a planted fixture, a scratch copy — not a change the run made.
for (const th of threads) {
  const removals = th.tools.filter((x) => x.name === 'Bash' && !th.results.get(x.id)?.err)
    .flatMap((x) => shellRemovals(x.input.command, PROJECT).map((p) => ({ p: rel(p), t: x.t })));
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    if (e.thread === th && removals.some((r) => r.t >= e.t && (r.p === e.file || e.file.startsWith(r.p.replace(/\/?$/, '/'))))) edits.splice(i, 1);
  }
}
const inProject = (r) => !r.startsWith('/') && !r.startsWith('<scratchpad>');

// 3. Scope: guard denials (attempts) and writes that went through outside the profile.
const DENIAL = /^PreToolUse:(\w+) hook error: ([^:(]+?)(?: \(([\w-]+)\))?: ([\s\S]*)/;
for (const th of threads) {
  const denials = [];
  for (const x of th.tools) {
    const r = th.results.get(x.id);
    if (!r?.err) continue;
    const m = r.text.match(DENIAL);
    if (m) denials.push(`${m[1]} → ${m[4].split('\n')[0].slice(0, 110)}`);
    else if (/Permission (to use \w+ has been|for this action was) denied/.test(r.text)) denials.push(`${x.name} → permission denied`);
  }
  if (denials.length) {
    const uniq = [...new Set(denials)];
    add('scope', 'warn', `${label(th)}: ${denials.length} denied call(s)`, uniq.slice(0, 3).join(' | ') + (uniq.length > 3 ? ` | +${uniq.length - 3} more` : ''), th.agentFile || 'main session');
  }
  if (th.id === 'main' || th.profile === 'none') continue;
  const bad = [];
  const mine = edits.filter((e) => e.thread === th);
  for (const e of mine) {
    if (e.via === 'bash' && th.profile === 'read-only') continue; // reported by the Bash check below
    {
      const r = e.file;
      if (e.via === 'bash' && !inProject(r)) continue; // /tmp, scratchpad, red-proof worktrees
      const core = /^server\/src\/db\/migrations\/|lock\.ya?ml$|package-lock\.json$|(^|\/)\.claude\/|CLAUDE(\.local)?\.md$|(^|\/)INSIGHTS\.md$/.test(r);
      const out =
        core ? 'protected path' :
        th.profile === 'read-only' ? 'read-only agent wrote' :
        th.profile === 'test-writer' && !isTest(r) && !/devdigest-redproof-/.test(r) ? 'test-writer wrote a non-test file' :
        th.profile === 'doc-writer' && !isDoc(r) ? 'doc-writer wrote a non-markdown file' :
        th.profile === 'doc-writer' && /(^|\/)(AGENTS\.md|specs\/)/.test(r) ? 'needs approval (AGENTS.md / spec)' :
        th.profile === 'spec-creator' && !isSpec(r) ? 'spec-creator wrote outside the spec folders' :
        th.profile === 'implementer' && isTest(r) ? 'implementer wrote a test' : null;
      if (out) bad.push(`${r} (${out}${e.via === 'bash' ? ', via shell' : ''})`);
    }
  }
  for (const x of th.tools) {
    if (th.results.get(x.id)?.err) continue;
    if (x.name === 'Bash' && th.profile === 'read-only') {
      const bare = String(x.input.command).replace(/'[^']*'|"[^"]*"/g, '').replace(/\d*>&\d|&?>>?\s*\/dev\/null/g, '');
      if (/>|(^|[;&|\s])(rm|mv|cp|tee|touch)\s|sed\s+-i/.test(bare)) bad.push(`Bash write: ${x.input.command.slice(0, 90)}`);
    }
  }
  if (bad.length) add('scope', 'crit', `${label(th)} wrote outside its scope (${th.profile})`, bad.slice(0, 4).join(' | '), th.agentFile);
  // Project files written through the shell: invisible to the Edit/Write path rules
  // (implementer-guard's test denial and schema/package.json ask), so flag them.
  const viaShell = [...new Set(mine.filter((e) => e.via === 'bash' && inProject(e.file)).map((e) => e.file))];
  if (th.profile !== 'read-only' && viaShell.length >= 2) {
    const viaTool = new Set(mine.filter((e) => e.via === 'tool').map((e) => e.file)).size;
    add('scope', 'warn', `${label(th)} wrote ${viaShell.length} project file(s) through the shell (${viaTool} via Edit/Write)`,
      `${viaShell.slice(0, 5).join(', ')}${viaShell.length > 5 ? ', …' : ''} — the guards' path rules see only Edit/Write`,
      `${th.agentFile} § Hard rules (Edit/Write only) + its guard in .claude/hooks/`);
  }
}
// 3b. Implementer edits the plan never mentions.
const plannerText = agents.filter((a) => isPlanner(a.type)).flatMap((a) => a.handbacks).join('\n');
if (plannerText) {
  const planned = new Set([...plannerText.matchAll(/[\w@.[\]-]+(?:\/[\w@.[\]-]+)+/g)].map((m) => m[0].replace(/[.,:;)]+$/, '')));
  const plannedDirs = [...planned];
  for (const a of agents.filter((x) => x.type === 'implementer')) {
    const edited = new Set(edits.filter((e) => e.thread === a && inProject(e.file)).map((e) => e.file));
    const off = [...edited].filter((r) => !planned.has(r) && !plannedDirs.some((p) => p.endsWith('/') ? r.startsWith(p) : r.startsWith(p + '/')));
    if (off.length) add('scope', 'info', `${label(a)} edited ${off.length} file(s) the plan does not name`, off.slice(0, 5).join(', ') + ' — check the report lists them under Deviations', '.claude/agents/implementer.md (deviation reporting) or implementation-planner.md (file list)');
  }
}

// 4. Skipped steps.
const editedFiles = new Set(edits.map((e) => e.file));
const codeEdited = [...editedFiles].filter(isCode);
const allHandbacks = agents.flatMap((a) => a.handbacks).join('\n');
const skillCalls = mainM.tools.filter((x) => x.name === 'Skill').map((x) => x.input.skill);
const mainBash = mainM.tools.filter((x) => x.name === 'Bash').map((x) => String(x.input.command));

// 4a. INSIGHTS.md
const insightsTouched = [...editedFiles].some((f) => /(^|\/)INSIGHTS\.md$/.test(f));
const candidates = [...allHandbacks.matchAll(/#+\s*Insight candidates?[^\n]*\n([\s\S]*?)(?=\n#+\s|\n---|$)/gi)].map((m) => m[1].trim()).filter((s) => s && !/^(\(?none\)?|—|-|немає|нема)\.?$/i.test(s));
if (candidates.length && !insightsTouched && !skillCalls.some((s) => /engineering-insights/.test(s)))
  add('skipped', 'warn', 'INSIGHTS.md not updated although agents reported Insight candidates', `${candidates.length} report(s) carry candidates; no INSIGHTS.md edit and no engineering-insights call in the main session`, 'AGENTS.md § Workflow 3 / .claude/agents/README.md § The flow (INSIGHTS step)');
else if (codeEdited.length && !insightsTouched && !skillCalls.some((s) => /engineering-insights/.test(s)))
  add('skipped', 'info', 'engineering-insights never ran for a run that changed code', 'no INSIGHTS.md edit and no engineering-insights call — fine only if nothing cleared the gate; say so explicitly', 'AGENTS.md § Workflow 3');
// 4b. vendored twins
const twins = [...editedFiles].filter((f) => /^(server|client)\/src\/vendor\/shared\//.test(f));
for (const f of twins) {
  const other = f.startsWith('server/') ? f.replace(/^server\//, 'client/') : f.replace(/^client\//, 'server/');
  if (!editedFiles.has(other)) add('skipped', 'crit', `vendored contract changed on one side only: ${f}`, `${other} was not edited in this run — the two copies must change together`, 'AGENTS.md § Cross-package invariants / implementer.md');
}
// 4c. package INSIGHTS.md read before the first edit in that package (per thread)
for (const th of threads) {
  const firstEdit = {};
  for (const e of edits.filter((x) => x.thread === th && !/\.md$/.test(x.file))) { const p = pkgOf(e.file); if (p && !(p in firstEdit)) firstEdit[p] = e.t; }
  for (const [p, t] of Object.entries(firstEdit)) {
    const readIt = th.tools.some((x) => x.t <= t && ((x.name === 'Read' && rel(x.input.file_path) === `${p}/INSIGHTS.md`) || (x.name === 'Bash' && bashReads(x.input.command).some((f) => rel(f) === `${p}/INSIGHTS.md`))));
    if (!readIt) add('skipped', 'warn', `${label(th)} edited ${p}/ without reading ${p}/INSIGHTS.md first`, `first ${p}/ edit at ${new Date(t).toISOString().slice(11, 19)}Z, no prior read`, th.agentFile || 'AGENTS.md § Workflow 1');
  }
}
// 4d. spec and docs
for (const p of new Set(codeEdited.map(pkgOf))) {
  const specSeen = [...reads.keys(), ...editedFiles].some((f) => f.startsWith(`${p}/specs/`) || /^docs\/specs\//.test(f));
  if (!specSeen) add('skipped', 'info', `${p}/ code changed but no spec was read or written`, `no ${p}/specs/*.md or docs/specs/*.md touched in the run`, 'AGENTS.md § Workflow 2 / implementation-planner.md');
}
if (codeEdited.length && ![...editedFiles].some((f) => isDoc(f) && !isSpec(f)) && !agents.some((a) => a.type === 'doc-writer'))
  add('skipped', 'warn', 'code changed but no docs were updated and doc-writer never ran', `${codeEdited.length} source file(s) edited`, 'AGENTS.md § Workflow 4 / .claude/agents/README.md § The flow');
// 4e. the flow
const has = (t) => agents.some((a) => a.type === t);
if (has('implementer') && !has('test-writer')) add('skipped', 'warn', 'implementer ran, test-writer did not', 'no test-writer spawn in the run', '.claude/agents/README.md § The flow');
if (has('implementer') && !['plan-verifier', 'architecture-reviewer', 'security-reviewer'].some(has)) add('skipped', 'warn', 'implementer ran, no verifier or reviewer did', 'none of plan-verifier / architecture-reviewer / security-reviewer spawned', '.claude/agents/README.md § The flow');
{
  const rev = agents.filter((a) => ['plan-verifier', 'architecture-reviewer', 'security-reviewer'].includes(a.type) && a.continuations === 0);
  const firsts = ['plan-verifier', 'architecture-reviewer', 'security-reviewer'].map((t) => rev.find((a) => a.type === t)).filter(Boolean);
  if (firsts.length >= 2) {
    const overlap = firsts.some((a, i) => firsts.some((b, j) => i < j && a.start < b.end && b.start < a.end));
    if (!overlap) add('parallel', 'warn', `${firsts.map((a) => a.type).join(', ')} ran one after another`, 'the flow runs them in parallel (∥) on the same uncommitted change', 'main session (launch them in one message)');
  }
}
// Not the implementer: a fix round and a per-package split (rule 7) are fresh spawns by design.
for (const t of ['plan-verifier', 'architecture-reviewer', 'security-reviewer']) {
  const n = agents.filter((a) => a.type === t).length;
  if (n > 1) add('skipped', 'warn', `${t} spawned fresh ${n}× — re-runs should continue the same agent`, 'a fresh spawn re-reads its whole context (cross-spawn cache never hits)', '.claude/agents/README.md § Token budget rules 6 and 10');
}
{
  const planDone = agents.find((a) => isPlanner(a.type))?.end;
  const impl = agents.find((a) => a.type === 'implementer');
  if (planDone && impl) {
    const human = main.some((e) => e.type === 'user' && e.origin?.kind === 'human' && ts(e) > planDone && ts(e) < impl.spawnedAt);
    if (!human) add('skipped', 'warn', 'implementer launched with no user turn after the plan', 'no human message between the implementation-planner hand-back and the implementer spawn', '.claude/agents/README.md § Token budget rule 2');
  }
}
// 4f. main-session hygiene (Token budget rules)
for (const a of agents) if (a.promptChars > 8000) add('skipped', 'info', `${label(a)} got a ${Math.round(a.promptChars / 1000)}k-char delegation prompt`, 'a re-typed plan or report rides along in every turn of that agent', '.claude/agents/README.md § Token budget rule 1 (pass the path)');
for (const x of mainM.tools) {
  const p = x.name === 'Read' ? rel(x.input.file_path) : x.name === 'Bash' ? String(x.input.command) : '';
  if (/\/tasks\/[\w-]+\.output|\/subagents\/agent-/.test(p) && !/>|wc -c|jq/.test(p)) add('skipped', 'info', 'main session read an agent transcript/report directly', p.slice(0, 120), '.claude/agents/README.md § Token budget rules 5 and 9');
  if (x.name === 'Artifact' && x.input.action === 'read') add('skipped', 'info', 'main session ran Artifact read', 'a bundled page can put ~40k tokens into the main context', '.claude/agents/README.md § Token budget rule 8');
}
{
  // Whole-suite runs only (`pnpm test`, `pnpm typecheck`, `tsc --noEmit`); a single
  // file (`vitest run test/x.test.ts`) is test-writer's 3-runs-per-file job, not a repeat.
  // Heredoc bodies are data, not commands (scripts/shell.mjs).
  const raw = threads.flatMap((th) => th.tools.filter((x) => x.name === 'Bash' && !th.results.get(x.id)?.err && isFullSuiteRun(x.input.command)).map(() => label(th)));
  const viaLedger = threads.reduce((s, th) => s + th.tools.filter((x) => x.name === 'Bash' && /checks\.sh/.test(x.input.command)).length, 0);
  if (raw.length >= 4) { const by = {}; for (const l of raw) by[l] = (by[l] || 0) + 1;
    add('skipped', 'info', `${raw.length} raw test/typecheck runs outside scripts/checks.sh (${viaLedger} through it)`, Object.entries(by).map(([k, v]) => `${k}×${v}`).join(', '), '.claude/agents/README.md § Token budget rule 11'); }
}
if (mainBash.some((c) => /git\s+push|gh\s+pr\s+create/.test(c)) && !skillCalls.some((s) => /pr-self-review/.test(s)))
  add('skipped', 'warn', 'pushed / opened a PR without /pr-self-review in this run', 'no pr-self-review Skill call in the window', 'AGENTS.md § Workflow 5');
{
  const agentCost = agents.reduce((s, a) => s + (a.cost || 0), 0);
  if (mainM.cost && agentCost && mainM.cost > agentCost) add('cost', 'info', `main session cost more than all agents together ($${mainM.cost.toFixed(2)} vs $${agentCost.toFixed(2)})`, `main context peaked at ${Math.round(mainM.peakCtx / 1000)}k over ${mainM.turns} turns`, '.claude/agents/README.md § Token budget rules 5, 9 and 12');
}

// ---------- output ----------
const fmtK = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const fmtD = (ms) => { if (!Number.isFinite(ms) || ms < 0) return '—'; const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
const fmtP = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const fmt$ = (x, unk) => (x == null ? 'unknown' : `$${x.toFixed(2)}${unk ? '+?' : ''}`);
const short = (m) => (m || []).map((x) => x.replace(/^claude-/, '').replace(/-\d{8}$/, '')).join(',');

const agentCost = agents.reduce((s, a) => s + (a.cost || 0), 0);
const unknown = agents.some((a) => a.cost === null || a.unknownCostCalls) || mainM.unknownCostCalls;
const total = { tokens: mainM.tokens + agents.reduce((s, a) => s + a.tokens, 0), cost: (mainM.cost || 0) + agentCost };
const inAll = [mainM, ...agents].reduce((s, t) => s + t.usage.in + t.usage.cr + t.usage.cw, 0);
const crAll = [mainM, ...agents].reduce((s, t) => s + t.usage.cr, 0);
total.cacheHit = inAll ? crAll / inAll : null;
const costState = mainAll.filter((e) => e.type === 'cost-state').pop();

const lines = [];
lines.push(`Session ${SESSION} · window ${Number.isFinite(SINCE) ? new Date(SINCE).toISOString().slice(0, 16) : 'start'} → ${Number.isFinite(UNTIL) ? new Date(UNTIL).toISOString().slice(0, 16) : 'end'} · ${agents.length} agents`);
lines.push('');
lines.push('| Agent | Model | Turns | Tokens | Cache hit | 1st-turn cache | Active | Tools (err) | Cost |');
lines.push('|---|---|---|---|---|---|---|---|---|');
lines.push(`| main | ${short(mainM.models)} | ${mainM.turns} | ${fmtK(mainM.tokens)} | ${fmtP(mainM.cacheHit)} | — | ${fmtD(mainM.end - mainM.start)} | ${mainM.toolCount} (${mainM.errors}) | ${fmt$(mainM.cost, mainM.unknownCostCalls)} |`);
for (const a of agents) lines.push(`| ${a.type} \`${a.id.slice(0, 5)}\`${a.continuations ? ` ×${a.continuations + 1}` : ''} | ${short(a.models)} | ${a.turns} | ${fmtK(a.tokens)} | ${fmtP(a.cacheHit)} | ${fmtK(a.firstTurnCacheRead)} | ${fmtD(a.activeMs)} | ${a.toolCount} (${a.errors}) | ${fmt$(a.cost, a.unknownCostCalls)} |`);
lines.push(`| **total** | | ${mainM.turns + agents.reduce((s, a) => s + a.turns, 0)} | ${fmtK(total.tokens)} | ${fmtP(total.cacheHit)} | | ${fmtD(parallel.wallMs)} wall | ${mainM.toolCount + agents.reduce((s, a) => s + a.toolCount, 0)} | ${fmt$(total.cost, unknown)} |`);
lines.push('');
lines.push(`Parallelism: peak ${parallel.peak} agents at once · avg ${parallel.avg.toFixed(2)} while any agent ran · agents busy ${fmtD(parallel.agentBusyMs)} of ${fmtD(parallel.wallMs)} wall`);
if (estimated.calls) lines.push(`Output tokens estimated for ${estimated.calls} of ${estimated.of} calls (no final usage line in the transcript) — tokens and cost are ≈; ` +
  (Object.keys(calibration).length ? `calibrated to cost-state: ${Object.entries(calibration).map(([m, f]) => `${m} ×${f.toFixed(2)}`).join(', ')}` : 'not calibrated (no fresh cost-state)'));
if (costState) lines.push(`Harness cost-state (whole session, last snapshot): $${costState.totalCostUSD.toFixed(2)} — computed for the window: ${fmt$(total.cost, unknown)}`);
lines.push('');
lines.push(`Findings (${findings.length}): ` + ['crit', 'warn', 'info'].map((s) => `${findings.filter((f) => f.severity === s).length} ${s}`).join(' · '));
const order = { crit: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
findings.forEach((f, i) => lines.push(`F${i + 1} [${f.severity}] ${f.kind}: ${f.title}${f.count ? ` (×${f.count})` : ''}\n    evidence: ${f.evidence}\n    target: ${f.target}`));
console.log(lines.join('\n'));

const counts = {}; for (const f of findings) counts[f.kind] = (counts[f.kind] || 0) + 1;
if (opt.json) {
  const strip = ({ tools, results, handbacks, ...rest }) => ({ ...rest, handbackChars: handbacks?.map((h) => h.length), byTool: rest.byTool });
  fs.writeFileSync(opt.json, JSON.stringify({ session: SESSION, since: SINCE, until: UNTIL, parallel, total, main: strip({ ...mainM, handbacks: [] }), agents: agents.map(strip), reRead, findings, costState: costState?.totalCostUSD ?? null }, null, 2));
  console.log(`\nJSON: ${opt.json}`);
}

if (opt.ledger) {
  const file = path.resolve(PROJECT, opt.ledger);
  if (!fs.existsSync(file)) die(`ledger ${file} does not exist — create it from the template in SKILL.md`);
  const src = fs.readFileSync(file, 'utf8');
  const key = `${SESSION.slice(0, 8)}@${Number.isFinite(SINCE) ? new Date(SINCE).toISOString().slice(0, 16) : 'start'}`;
  if (src.includes(`\`${key}\``)) { console.log(`\nledger: a row for ${key} already exists — not appended (the ledger is append-only)`); process.exit(0); }
  const branch = (main.find((e) => e.gitBranch) || mainAll.find((e) => e.gitBranch) || {}).gitBranch || '?';
  const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 80);
  const row = `| ${new Date(Number.isFinite(UNTIL) ? UNTIL : mainM.end).toISOString().slice(0, 10)} | \`${key}\` | ${cell(branch)} | ${cell(opt.run || '')} | ${agents.length} | ${fmtD(parallel.wallMs)} | ${parallel.peak} / ${parallel.avg.toFixed(1)} | ${fmtK(total.tokens)} | ${fmtP(total.cacheHit)} | ${fmt$(total.cost, unknown)} | ${counts['re-read'] || 0} | ${counts['re-ask'] || 0} | ${counts.scope || 0} | ${counts.skipped || 0} | ${cell(opt.note || '')} |`;
  fs.writeFileSync(file, src.replace(/\n*$/, '\n') + row + '\n');
  console.log(`\nledger: appended to ${path.relative(PROJECT, file)}\n${row}`);
}
