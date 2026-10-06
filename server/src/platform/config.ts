import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest2:devdigest2@localhost:5432/devdigest2'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  // Project Context (L05): comma-separated folder names whose `.md` files are
  // listed. Invalid names are ignored (a warning is logged at startup); with no
  // valid name left the defaults apply.
  PROJECT_CONTEXT_FOLDERS: z.string().optional(),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  // An empty (or blank) NODE_ENV counts as unset: it falls through to the default
  // and, for prompt logging, is not "explicit" (see loadConfig).
  NODE_ENV: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
  // Prompt-assembly logging. `verbose` adds per-chunk detail (hashes, a masked
  // system-prompt preview) and is honoured only for an EXPLICIT local NODE_ENV.
  DEVDIGEST_PROMPT_LOG: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['default', 'verbose']).optional(),
  ),
});

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Prompt-log mode actually in effect (verbose only for an explicit development/test NODE_ENV). */
  promptLog: 'default' | 'verbose';
  /** What DEVDIGEST_PROMPT_LOG asked for, before the environment check. */
  promptLogRequested: 'default' | 'verbose';
  /** Why a requested verbose mode was not honoured; undefined when it was (or not requested). */
  promptLogIgnoredReason?: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /** Folder names searched for project-context `.md` docs (default `docs`, `specs`). */
  contextFolders: string[];
  /** Names from PROJECT_CONTEXT_FOLDERS that were invalid and ignored. */
  contextFoldersIgnored: string[];
};

const DEFAULT_CONTEXT_FOLDERS = ['docs', 'specs'];

/** A folder name is valid unless empty or containing `/ * ? { } ,` or `..`. */
function parseContextFolders(raw: string | undefined): { folders: string[]; ignored: string[] } {
  if (raw === undefined || raw.trim() === '') return { folders: [...DEFAULT_CONTEXT_FOLDERS], ignored: [] };
  const folders: string[] = [];
  const ignored: string[] = [];
  for (const name of raw.split(',').map((s) => s.trim())) {
    if (name === '' || /[/*?{},]/.test(name) || name.includes('..')) {
      ignored.push(name);
    } else if (!folders.includes(name)) {
      folders.push(name);
    }
  }
  return { folders: folders.length > 0 ? folders : [...DEFAULT_CONTEXT_FOLDERS], ignored };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  const promptLogRequested = parsed.DEVDIGEST_PROMPT_LOG ?? 'default';
  // "Local only" needs an EXPLICIT NODE_ENV: the schema default ('development')
  // must not count, or an unconfigured deployment would honour the flag.
  const rawNodeEnv = env.NODE_ENV;
  const nodeEnvExplicit = typeof rawNodeEnv === 'string' && rawNodeEnv.trim() !== '';
  const local = nodeEnvExplicit && (parsed.NODE_ENV === 'development' || parsed.NODE_ENV === 'test');
  const promptLog = promptLogRequested === 'verbose' && local ? 'verbose' : 'default';
  const promptLogIgnoredReason =
    promptLogRequested === 'verbose' && !local
      ? nodeEnvExplicit
        ? `NODE_ENV=${parsed.NODE_ENV}`
        : 'NODE_ENV not set explicitly'
      : undefined;
  const context = parseContextFolders(parsed.PROJECT_CONTEXT_FOLDERS);
  return {
    contextFolders: context.folders,
    contextFoldersIgnored: context.ignored,
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel:
      parsed.LOG_LEVEL ??
      (parsed.NODE_ENV === 'test' ? 'silent' : promptLog === 'verbose' ? 'debug' : 'info'),
    promptLog,
    promptLogRequested,
    ...(promptLogIgnoredReason ? { promptLogIgnoredReason } : {}),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
  };
}
