/**
 * Ring ③: Server-Sent Events decoding for `GET /runs/:id/events`. Pure parser
 * plus a stream adapter; no network and no MCP SDK here.
 */
import { RunEvent } from '../../core/schemas.ts';
import type { RunEvent as RunEventT } from '../../core/schemas.ts';

export interface SseFrame {
  id: string | undefined;
  event: string;
  data: string;
}

export interface SseParser {
  /** Feed a decoded chunk; returns the frames completed by it. */
  push(chunk: string): SseFrame[];
}

export function createSseParser(): SseParser {
  let buf = '';
  let id: string | undefined;
  let event = '';
  let data: string[] = [];

  const frames: SseFrame[] = [];

  function handleLine(line: string): void {
    if (line === '') {
      if (data.length > 0) frames.push({ id, event: event || 'message', data: data.join('\n') });
      event = '';
      data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
  }

  return {
    push(chunk) {
      buf += chunk;
      frames.length = 0;
      for (;;) {
        const m = /\r\n|\n|\r/.exec(buf);
        if (!m) break;
        // A trailing "\r" may be the first half of "\r\n": wait for more input.
        if (m[0] === '\r' && m.index + 1 === buf.length) break;
        handleLine(buf.slice(0, m.index));
        buf = buf.slice(m.index + m[0].length);
      }
      return frames.splice(0, frames.length);
    },
  };
}

/** Decode a byte stream into valid, de-duplicated `RunEvent`s. Invalid frames are skipped. */
export async function* parseRunEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<RunEventT> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const seen = new Set<number>();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        let json: unknown;
        try {
          json = JSON.parse(frame.data);
        } catch {
          continue;
        }
        const parsed = RunEvent.safeParse(json);
        if (!parsed.success || seen.has(parsed.data.seq)) continue;
        seen.add(parsed.data.seq);
        yield parsed.data;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
