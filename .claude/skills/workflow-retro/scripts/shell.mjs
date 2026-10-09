// Bash-command parsing for retro.mjs: which files a command reads, which it writes,
// and whether it is a whole-suite test run. Pure functions, unit-tested in
// retro.test.mjs. Heuristics, not a shell parser — see SKILL.md § Transcript format.

import os from 'node:os';
import path from 'node:path';

const FILE_EXT = /[\w)\]]\.(md|tsx?|mjs|cjs|js|jsx|json|ya?ml|sh|sql|txt|css|html)$/;
const READ_CMDS = new Set(['cat', 'head', 'tail', 'sed', 'nl', 'less', 'awk']);

// Cut every heredoc body out of a command. The body is data (a file's new content,
// a python script), so a `pnpm test` or `cat x.ts` inside it is not a command. The
// body is replaced by a placeholder token on the head line, so a caller can still
// look at the bodies that belong to a given segment.
export function stripHeredocs(cmd) {
  const bodies = [];
  const bare = String(cmd).replace(/<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g,
    (_, _q, _tag, rest, body) => { bodies.push(body); return `__HEREDOC_${bodies.length - 1}__${rest}`; });
  return { bare, bodies };
}

// Split into simple commands, tracking `cd` (the shell starts in `root` on every
// call): yields { seg, cwd } with quoted text kept, so callers decide what to strip.
function* segments(bare, root) {
  let cwd = root;
  for (const raw of bare.split(/&&|\|\||;|\||\n/)) {
    const seg = raw.trim();
    if (!seg) continue;
    const cd = seg.match(/^cd\s+(['"]?)([^'"\s]+)\1\s*$/);
    if (cd) { cwd = path.resolve(cwd, cd[2].replace(/^~(?=\/|$)/, os.homedir())); continue; }
    yield { seg, cwd };
  }
}
const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');
const dropQuoted = (s) => s.replace(/'[^']*'|"[^"]*"/g, ' ');

export function bashReads(cmd, root) {
  const out = [];
  for (const { seg, cwd } of segments(stripHeredocs(cmd).bare, root)) {
    const w = seg.split(/\s+/);
    if (!READ_CMDS.has(w[0])) continue;
    for (const a of w.slice(1)) {
      if (a.startsWith('-') || /^['"]/.test(a) || /^\d+[,p]/.test(a)) continue;
      if (FILE_EXT.test(a)) out.push(path.resolve(cwd, a));
    }
  }
  return out;
}

// Files a command writes: `>`/`>>` redirects (not /dev/null, not &N), tee, sed -i,
// cp/mv destinations, touch, and python heredocs that open a path for writing.
// A python heredoc writes a path only when the path reaches open(…, 'w'|'a') or
// write_text: directly, through a variable, or as the first argument of a helper
// whose first parameter is opened for writing (`def sub(p, a, b): … open(p,'w')`).
// Any other path literal in the body is data — a mutation spec, an import line in
// the code being inserted — and is not a write (2026-10-03: both false-positived).
export function pythonWrites(body) {
  const W = `\\s*,\\s*['"][wa]\\+?['"]`;
  const out = new Set();
  for (const m of body.matchAll(new RegExp(`open\\(\\s*['"]([^'"]+)['"]${W}`, 'g'))) out.add(m[1]);
  for (const m of body.matchAll(/Path\(\s*['"]([^'"]+)['"]\s*\)\.write_text\(/g)) out.add(m[1]);
  const vars = new Set([...body.matchAll(new RegExp(`open\\(\\s*([A-Za-z_]\\w*)${W}`, 'g'))].map((m) => m[1]));
  for (const m of body.matchAll(/Path\(\s*([A-Za-z_]\w*)\s*\)\.write_text\(/g)) vars.add(m[1]);
  // A literal counts only when it is the whole value (`p='a.ts'`, `sub('a.ts', …)`);
  // a prefix being concatenated (`sub('dir/' + name, …)`) is skipped, not guessed.
  for (const v of vars) for (const m of body.matchAll(new RegExp(`(?:^|\\n)[ \\t]*${v}\\s*=\\s*['"]([^'"]+)['"][ \\t]*(?=$|\\n|;|#)`, 'g'))) out.add(m[1]);
  for (const d of body.matchAll(/def\s+([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*)/g)) {
    if (!vars.has(d[2])) continue;
    for (const c of body.matchAll(new RegExp(`(?<![\\w.])${d[1]}\\(\\s*['"]([^'"]+)['"]\\s*[,)]`, 'g'))) out.add(c[1]);
  }
  return [...out].filter((p) => !p.endsWith('/'));
}

// Unresolvable paths (shell variables, globs, history) are skipped, not guessed.
const resolvable = (p) => p && !/[$`!*{}]/.test(p);

export function shellWrites(cmd, root) {
  const { bare, bodies } = stripHeredocs(cmd);
  const out = new Set();
  const add = (cwd, p) => { p = unquote(p); if (resolvable(p) && p !== '/dev/null' && !p.startsWith('&') && !p.startsWith('__HEREDOC_')) out.add(path.resolve(cwd, p)); };
  for (const { seg, cwd } of segments(bare, root)) {
    const plain = dropQuoted(seg);
    for (const m of plain.matchAll(/(?:^|[^<>&\d])\d?>>?[ \t]*([^\s;&|<>()]+)/g)) add(cwd, m[1]);
    const w = seg.split(/\s+/).filter(Boolean);
    const args = w.slice(1).filter((a) => !a.startsWith('-') && !a.startsWith('__HEREDOC_'));
    if (w[0] === 'tee' || w[0] === 'touch') args.forEach((a) => add(cwd, a));
    if ((w[0] === 'cp' || w[0] === 'mv') && args.length >= 2) {
      // `cp a.ts dir/` writes dir/a.ts: a destination without a file extension is a directory
      const dest = unquote(args[args.length - 1]);
      for (const src of args.slice(0, -1)) add(cwd, FILE_EXT.test(dest) ? dest : path.join(dest, path.basename(unquote(src))));
    }
    if (w[0] === 'sed' && w.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place')) args.filter((a) => FILE_EXT.test(unquote(a))).forEach((a) => add(cwd, a));
    if (/^python3?$/.test(w[0])) for (const n of seg.matchAll(/__HEREDOC_(\d+)__/g)) pythonWrites(bodies[+n[1]]).forEach((p) => add(cwd, p));
  }
  return [...out];
}

// Paths a command deletes (`rm [-rf] …`): a file written and then removed — a planted
// fixture, a scratch copy — is not a change the run made.
export function shellRemovals(cmd, root) {
  const out = [];
  for (const { seg, cwd } of segments(stripHeredocs(cmd).bare, root)) {
    const w = seg.split(/\s+/);
    if (w[0] !== 'rm') continue;
    for (const a of w.slice(1)) if (!a.startsWith('-') && resolvable(unquote(a))) out.push(path.resolve(cwd, unquote(a)));
  }
  return out;
}

// A real `git push` / `gh pr create`: the command word, not text that mentions it —
// a quoted grep pattern or a heredoc body is data (2026-10-05: a grep for the
// gate's own wording was counted as a push).
export function isPushOrPr(cmd) {
  const plain = dropQuoted(stripHeredocs(cmd).bare);
  return /(^|[;&|\n(]\s*|\s)git(\s+-[Cc]\s+\S+)*\s+push\b|(^|[;&|\n(]\s*|\s)gh\s+pr\s+create\b/.test(plain);
}

// A whole-suite run (`pnpm test`, `pnpm typecheck`, `tsc --noEmit`) outside
// scripts/checks.sh. A single file (`vitest run test/x.test.ts`) is not one.
export function isFullSuiteRun(cmd) {
  const { bare } = stripHeredocs(cmd);
  if (/checks\.sh/.test(bare)) return false;
  const plain = dropQuoted(bare);
  return /(^|[;&|\n]\s*|\s)(pnpm|npm)\s+(run\s+)?(test|typecheck|lint)(\s*($|[;&|>\n]|2>))|\btsc\s+--noEmit\b/.test(plain);
}
