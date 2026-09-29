/**
 * Adapter (ring ③) — a hand-written SSE reader over the DevDigest event
 * stream. No third-party SSE client package (D1): the server's frames are
 * plain `id:`/`event:`/`data:` lines the same as any fetch body, so a tiny
 * parser is enough and keeps the dependency list to `zod` + the SDK. May
 * import ①, `log.ts`, `fetch` types and `TextDecoder`; must not import ②/④
 * or the SDK.
 */
import { RunEventWire } from '../contracts.js';
import { log } from '../log.js';
import type { StreamEnd } from '../ports.js';

export interface SseMessage {
  data: string;
}

/**
 * A minimal SSE frame parser: buffers across chunk boundaries, joins
 * multi-line `data:` fields with `\n`, strips one leading space after the
 * field's `:`, ignores `:`-comments and any other field (`event:`, `id:`,
 * `retry:` are not needed — the payload's own `kind`/`seq` carry that), and
 * dispatches only frames that carried at least one `data:` line.
 */
export function createSseParser(onMessage: (msg: SseMessage) => void): {
  push(text: string): void;
  end(): void;
} {
  let buffer = '';
  let dataLines: string[] = [];
  let hasData = false;

  function dispatchIfAny(): void {
    if (hasData) {
      onMessage({ data: dataLines.join('\n') });
    }
    dataLines = [];
    hasData = false;
  }

  function processLine(rawLine: string): void {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      dispatchIfAny();
      return;
    }
    if (line.startsWith(':')) {
      return; // comment
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') {
      dataLines.push(value);
      hasData = true;
    }
    // event/id/retry: intentionally ignored, see docblock.
  }

  return {
    push(text: string): void {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
    },
    end(): void {
      if (buffer.length > 0) {
        processLine(buffer);
        buffer = '';
      }
      dispatchIfAny();
    },
  };
}

/**
 * Drains a fetch response body of `RunEvent` SSE frames until the stream
 * closes or `signal` aborts. Invalid frames (bad JSON, failed schema) are
 * logged to stderr and skipped — one bad frame never ends the stream.
 */
export async function readRunEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (e: RunEventWire) => void,
  signal: AbortSignal,
): Promise<StreamEnd> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let ended: StreamEnd | null = null;

  const onAbort = (): void => {
    ended = 'aborted';
    reader.cancel().catch(() => {});
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort);

  const parser = createSseParser((msg) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.data);
    } catch {
      log('warn', 'sse: invalid JSON frame, skipped', { data: msg.data.slice(0, 200) });
      return;
    }
    const result = RunEventWire.safeParse(parsed);
    if (!result.success) {
      log('warn', 'sse: frame failed schema, skipped', {
        issue: result.error.issues[0]?.message,
      });
      return;
    }
    onEvent(result.data);
  });

  try {
    while (!ended) {
      const { done, value } = await reader.read();
      if (ended) break;
      if (done) {
        parser.end();
        ended = 'closed';
        break;
      }
      if (value) parser.push(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    if (!ended) throw err;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  return ended ?? 'closed';
}
