/**
 * WP5.tests — the hand-written SSE parser (`createSseParser`) and reader
 * (`readRunEvents`), Contract § Architecture ring ③.
 */
import { describe, expect, it } from 'vitest';
import { createSseParser, readRunEvents, type SseMessage } from '../src/api/sse.js';
import type { RunEventWire } from '../src/contracts.js';

describe('createSseParser', () => {
  it('emits exactly one message for a frame split across pushes, ignoring a leading retry frame', () => {
    const messages: SseMessage[] = [];
    const parser = createSseParser((m) => messages.push(m));

    parser.push('retry: 3000\n\n');
    parser.push('id: 1\nevent: info\nda');
    parser.push('ta: {"seq":1,"kind":"info","msg":"Loading PR diff"}\n\n');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe('{"seq":1,"kind":"info","msg":"Loading PR diff"}');
  });

  it('joins multiple data: lines with \\n, stripping \\r', () => {
    const messages: SseMessage[] = [];
    const parser = createSseParser((m) => messages.push(m));

    parser.push('data: a\r\ndata: b\r\n\r\n');

    expect(messages).toEqual([{ data: 'a\nb' }]);
  });

  it('ignores a comment-only frame', () => {
    const messages: SseMessage[] = [];
    const parser = createSseParser((m) => messages.push(m));

    parser.push(': comment\n\n');

    expect(messages).toHaveLength(0);
  });
});

/** Builds a ReadableStream<Uint8Array> whose controller stays open until
 * `push`/`close` are called — unlike a `start`-only stream, this lets a test
 * hold the stream open (never enqueueing/closing) to exercise abort. */
function openStream(): {
  stream: ReadableStream<Uint8Array>;
  push: (text: string) => void;
  close: () => void;
} {
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const encoder = new TextEncoder();
  return {
    stream,
    push: (text: string) => controllerRef?.enqueue(encoder.encode(text)),
    close: () => controllerRef?.close(),
  };
}

describe('readRunEvents', () => {
  it('skips a frame with invalid JSON but still delivers the next valid frame, then resolves closed', async () => {
    const { stream, push, close } = openStream();
    const events: RunEventWire[] = [];

    const promise = readRunEvents(stream, (e) => events.push(e), new AbortController().signal);
    push('data: not json\n\n');
    push('data: {"seq":2,"kind":"info","msg":"ok"}\n\n');
    close();

    await expect(promise).resolves.toBe('closed');
    expect(events).toEqual([{ seq: 2, kind: 'info', msg: 'ok' }]);
  });

  it('resolves closed when the stream ends normally', async () => {
    const { stream, push, close } = openStream();
    const events: RunEventWire[] = [];

    const promise = readRunEvents(stream, (e) => events.push(e), new AbortController().signal);
    push('data: {"seq":1,"kind":"info","msg":"x"}\n\n');
    close();

    await expect(promise).resolves.toBe('closed');
    expect(events).toEqual([{ seq: 1, kind: 'info', msg: 'x' }]);
  });

  it('resolves aborted when the signal aborts mid-stream, without ending on its own', async () => {
    const { stream } = openStream(); // never pushed to or closed
    const controller = new AbortController();

    const promise = readRunEvents(stream, () => {}, controller.signal);
    controller.abort();

    await expect(promise).resolves.toBe('aborted');
  });
});
