import { describe, expect, it } from 'vitest';
import { createSseParser, parseRunEvents } from '../src/adapters/http/sse.ts';

describe('createSseParser', () => {
  it('assembles one frame from a chunk split mid-line', () => {
    const p = createSseParser();
    expect(p.push('id: 1\nevent: info\ndata: {"a"')).toEqual([]);
    expect(p.push(':1}\n\n')).toEqual([{ id: '1', event: 'info', data: '{"a":1}' }]);
  });

  it('joins multi-line data with a newline and accepts CRLF', () => {
    const frames = createSseParser().push('data: x\r\ndata: y\r\n\r\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toBe('x\ny');
  });

  it('ignores comment frames', () => {
    expect(createSseParser().push(': ping\n\n')).toEqual([]);
  });

  it('returns two frames when two arrive in one chunk', () => {
    const frames = createSseParser().push('id: 1\ndata: a\n\nid: 2\ndata: b\n\n');
    expect(frames.map((f) => [f.id, f.data])).toEqual([
      ['1', 'a'],
      ['2', 'b'],
    ]);
  });
});

describe('parseRunEvents', () => {
  const enc = new TextEncoder();
  const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(c) {
        for (const x of chunks) c.enqueue(enc.encode(x));
        c.close();
      },
    });
  const ev = (seq: number) =>
    `id: ${seq}\nevent: info\ndata: ${JSON.stringify({ runId: 'r', seq, kind: 'info', msg: `m${seq}` })}\n\n`;

  it('skips invalid frames and duplicate seq', async () => {
    const out: number[] = [];
    for await (const e of parseRunEvents(streamOf(ev(1), ev(2), 'data: nope\n\n', ev(2)))) out.push(e.seq);
    expect(out).toEqual([1, 2]);
  });

  it('decodes a multi-byte character split across chunks', async () => {
    const bytes = enc.encode(`data: ${JSON.stringify({ runId: 'r', seq: 1, kind: 'k', msg: 'é✓' })}\n\n`);
    const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
    const s = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const got: string[] = [];
    for await (const e of parseRunEvents(s)) got.push(e.msg);
    expect(got).toEqual(['é✓']);
  });
});
