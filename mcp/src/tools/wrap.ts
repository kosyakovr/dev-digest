/**
 * Boundary (ring ④) — the one place every tool handler's errors are caught
 * and mapped. May import everything except `api/` values.
 */
import { DevDigestError, unexpectedToolError } from '../errors.js';
import { log } from '../log.js';
import { toolError, type ToolCallResult } from './result.js';

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Wraps a `registerTool` callback so a thrown `DevDigestError` becomes its
 * own message, a cancelled request becomes "Cancelled.", and anything else
 * becomes E21 — with the real stack logged to stderr only, never returned to
 * the caller.
 */
export function wrap<Args, Extra>(
  toolName: string,
  fn: (args: Args, extra: Extra) => Promise<ToolCallResult>,
): (args: Args, extra: Extra) => Promise<ToolCallResult> {
  return async (args: Args, extra: Extra): Promise<ToolCallResult> => {
    try {
      return await fn(args, extra);
    } catch (err) {
      if (isAbortError(err)) return toolError('Cancelled.');
      if (err instanceof DevDigestError) return toolError(err.message);
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error) {
        log('error', `${toolName}: unexpected error`, { stack: err.stack ?? message });
      }
      return toolError(unexpectedToolError(toolName, message).message);
    }
  };
}
