/**
 * L05 onboarding tour — literals (ring ①, no logic). Every number and name the
 * module compares against lives here so a change is one edit.
 */

/** Wall-clock budget for the whole model call (NFR-1). */
export const TOUR_DEADLINE_MS = 120_000;
export const TOUR_MAX_TOKENS = 6_000;
/** `maxRetries` 1 = at most 2 attempts. */
export const TOUR_MAX_RETRIES = 1;
export const TOUR_TEMPERATURE = 0.2;

export const README_EXCERPT_CHARS = 4_000;
export const MAX_RUN_STEPS = 20;
export const MAX_STACK_DEPS = 15;
export const MAX_DIAGRAM_NODES = 12;
export const MAX_ENDPOINTS_LISTED = 10;
export const MAX_TASKS = 3;
/** A manifest or README blob larger than this is not read. */
export const MANIFEST_MAX_BYTES = 256 * 1024;

/** Section kinds and titles, in the order the tour stores them. */
export const SECTION_TITLES = [
  { kind: 'architecture_overview', title: 'Architecture overview' },
  { kind: 'critical_paths', title: 'Critical paths' },
  { kind: 'how_to_run', title: 'How to run locally' },
  { kind: 'guided_reading', title: 'Guided reading path' },
  { kind: 'first_tasks', title: 'First tasks' },
] as const;

/** Lockfile name → package manager and its install command (A-7). */
export const LOCKFILES = [
  { file: 'pnpm-lock.yaml', pm: 'pnpm', install: 'pnpm install' },
  { file: 'package-lock.json', pm: 'npm', install: 'npm ci' },
  { file: 'yarn.lock', pm: 'yarn', install: 'yarn install' },
] as const;
export const DEFAULT_PM = { pm: 'npm', install: 'npm install' } as const;

/** Script names that become run steps, in order. Fixed, so repo text stays out of commands. */
export const RUN_SCRIPTS = ['dev', 'start', 'test'] as const;

export const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;
export const COMPOSE_STEP = 'docker compose up -d';
export const ENV_EXAMPLE_FILE = '.env.example';
export const ENV_COPY_STEP = 'cp .env.example .env';

/** A directory name is used in a shell command only if it matches this. */
export const SAFE_DIR_NAME = /^[A-Za-z0-9._-]+$/;

export const TOUR_IN_PROGRESS_MESSAGE =
  'An onboarding tour is already being generated for this repository.';
export const TOUR_KEPT_MESSAGE = 'The model call failed — your previous tour is unchanged.';
export const TOUR_IN_PROGRESS_CODE = 'tour_in_progress';
