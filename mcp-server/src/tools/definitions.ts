/**
 * Ring ④: the ONLY place tool names, titles, descriptions, input schemas and
 * annotations live. The strings are copied verbatim from
 * `specs/L04-mcp-server.md` § Tool and field descriptions; a wording change needs
 * the user's approval and a spec change first. Fields not described there carry
 * NO `.describe()`. No use-case logic here.
 */
import { z } from 'zod';

const pr = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .describe('Pull request: owner/repo#123, GitHub PR URL, or DevDigest PR id');
const agent = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('Agent name or id from list_agents');
const repo = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('Repository: owner/repo or DevDigest repo id');
const runId = z
  .string()
  .uuid()
  .optional()
  .describe('run_id from run_agent_on_pr; omit for the latest review');
const responseFormat = z.enum(['concise', 'detailed']).default('concise');
const limit = (dflt: number) => z.number().int().min(1).max(100).default(dflt);
const offset = z.number().int().min(0).default(0);
const minSeverity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']).default('SUGGESTION');
const status = z.enum(['accepted', 'pending', 'rejected', 'all']).default('accepted');

interface Annotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

const READ_ONLY: Annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const listAgentsTool = {
  name: 'list_agents',
  title: 'List reviewer agents',
  description:
    'List DevDigest AI reviewer agents (name, model, enabled). Call first to pick the agent for run_agent_on_pr.',
  inputSchema: { response_format: responseFormat },
  annotations: READ_ONLY,
} as const;

export const runAgentOnPrTool = {
  name: 'run_agent_on_pr',
  title: 'Run AI review on a PR',
  description:
    'Run one DevDigest AI reviewer agent on a pull request (paid LLM call). Blocks up to ~110s; returns findings, or status running + run_id for get_findings.',
  inputSchema: { pr, agent, response_format: responseFormat },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
} as const;

export const getFindingsTool = {
  name: 'get_findings',
  title: 'Get review findings',
  description:
    'Get findings of a finished DevDigest AI review of a pull request: latest, or by run_id or agent. Read-only; safe to poll after run_agent_on_pr.',
  inputSchema: {
    pr,
    run_id: runId,
    agent: agent.optional(),
    min_severity: minSeverity,
    limit: limit(20),
    offset,
    response_format: responseFormat,
  },
  annotations: READ_ONLY,
} as const;

export const getConventionsTool = {
  name: 'get_conventions',
  title: 'Get repo conventions',
  description:
    "Get a repository's coding conventions from DevDigest (accepted by default): rule, category, evidence file:line. Read-only; never starts a scan.",
  inputSchema: {
    repo,
    status,
    limit: limit(30),
    offset,
    response_format: responseFormat,
  },
  annotations: READ_ONLY,
} as const;

export const getBlastRadiusTool = {
  name: 'get_blast_radius',
  title: 'Get PR blast radius',
  description:
    "Show what a pull request's changes can break: changed symbols, their callers (file:line), affected HTTP endpoints and crons, from the DevDigest index. Read-only; call before reviewing a risky PR.",
  inputSchema: { pr, response_format: responseFormat },
  annotations: READ_ONLY,
} as const;

/** In registration order. */
export const TOOL_DEFINITIONS = [
  listAgentsTool,
  runAgentOnPrTool,
  getFindingsTool,
  getConventionsTool,
  getBlastRadiusTool,
] as const;
