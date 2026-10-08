import { z } from 'zod';
import type { OnboardingStep } from '@devdigest/shared';
import {
  COMPOSE_FILES,
  COMPOSE_STEP,
  DEFAULT_PM,
  ENV_COPY_STEP,
  ENV_EXAMPLE_FILE,
  LOCKFILES,
  MAX_RUN_STEPS,
  MAX_STACK_DEPS,
  RUN_SCRIPTS,
  SAFE_DIR_NAME,
} from './constants.js';

/**
 * L05 onboarding tour — run steps and stack facts (ring ②, pure: no I/O, no
 * await). Steps come ONLY from manifests, lockfiles, `.env.example` and compose
 * files; the commands are built from fixed names, never from repo text (A-7).
 */

const Manifest = z.object({
  scripts: z.record(z.string(), z.unknown()).optional(),
  dependencies: z.record(z.string(), z.unknown()).optional(),
});

/** '' is the repo root; otherwise a safe top-level directory name. */
type ScanDir = string;

/** The root (if it holds a package.json) then top-level dirs holding one, alphabetical. */
export function scanDirs(tree: string[]): ScanDir[] {
  const set = new Set(tree);
  const dirs: ScanDir[] = [];
  if (set.has('package.json')) dirs.push('');
  const top = new Set<string>();
  for (const p of tree) {
    const parts = p.split('/');
    if (parts.length === 2 && parts[1] === 'package.json') top.add(parts[0]!);
  }
  for (const d of [...top].sort()) {
    if (SAFE_DIR_NAME.test(d)) dirs.push(d);
  }
  return dirs;
}

/** Repo-relative manifest paths the service must read (one per scanned directory). */
export function manifestPaths(tree: string[]): string[] {
  return scanDirs(tree).map((d) => (d ? `${d}/package.json` : 'package.json'));
}

const at = (dir: ScanDir, file: string) => (dir ? `${dir}/${file}` : file);

function packageManagerOf(set: Set<string>, dir: ScanDir): { pm: string; install: string } {
  for (const l of LOCKFILES) if (set.has(at(dir, l.file))) return l;
  return DEFAULT_PM;
}

function parseManifest(raw: string | undefined) {
  if (raw === undefined) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = Manifest.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function buildRunSteps(tree: string[], manifests: Record<string, string>): OnboardingStep[] {
  const set = new Set(tree);
  const steps: OnboardingStep[] = [];
  for (const dir of scanDirs(tree)) {
    const prefix = dir ? `cd ${dir} && ` : '';
    const { pm, install } = packageManagerOf(set, dir);
    steps.push({ command: `${prefix}${install}` });
    if (set.has(at(dir, ENV_EXAMPLE_FILE))) steps.push({ command: `${prefix}${ENV_COPY_STEP}` });
    const manifest = parseManifest(manifests[at(dir, 'package.json')]);
    for (const name of RUN_SCRIPTS) {
      if (manifest?.scripts && Object.hasOwn(manifest.scripts, name)) {
        steps.push({ command: `${prefix}${pm} run ${name}` });
      }
    }
  }
  if (COMPOSE_FILES.some((f) => set.has(f))) steps.push({ command: COMPOSE_STEP });
  return steps.slice(0, MAX_RUN_STEPS);
}

export function detectStack(tree: string[], manifests: Record<string, string>): string[] {
  const set = new Set(tree);
  const dirs = scanDirs(tree);
  const out: string[] = [];
  const add = (v: string) => {
    if (!out.includes(v)) out.push(v);
  };
  for (const dir of dirs) add(packageManagerOf(set, dir).pm);
  for (const dir of dirs) {
    const deps = parseManifest(manifests[at(dir, 'package.json')])?.dependencies;
    if (!deps) continue;
    for (const name of Object.keys(deps).sort().slice(0, MAX_STACK_DEPS)) add(name);
  }
  const dockerfile = ['', ...dirs].some((d) => set.has(at(d, 'Dockerfile')));
  if (dockerfile || COMPOSE_FILES.some((f) => set.has(f))) add('Docker');
  return out;
}
