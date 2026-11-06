import { describe, expect, it } from 'vitest';
import { createClient, parseSse } from '../src';

/** A body that delivers `chunks` one read at a time. */
function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;

  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];

  for await (const item of iterable) {
    out.push(item);
  }

  return out;
}

describe('parseSse', () => {
  it('parses fields, JSON data and multi-line data', async () => {
    const events = await collect(
      parseSse(stream(['event: tick\nid: 1\nretry: 500\ndata: {"n":1}\n\n', 'data: line1\ndata: line2\n\n'])),
    );

    expect(events).toEqual([
      { event: 'tick', id: '1', retry: 500, data: { n: 1 } },
      { event: undefined, id: undefined, retry: undefined, data: 'line1\nline2' },
    ]);
  });

  it('handles events split across chunks, CRLF and a CR split from its LF', async () => {
    const events = await collect(parseSse(stream(['da', 'ta: "a"\r', '\n\r\ndata: b\r\r', 'data:c\n', '\n'])));

    expect(events.map((e) => e.data)).toEqual(['a', 'b', 'c']);
  });

  it('skips comments and delivers events without data', async () => {
    const events = await collect(parseSse(stream([': heartbeat\n\n', 'event: done\n\n'])));

    expect(events).toEqual([{ event: 'done', id: undefined, retry: undefined, data: undefined }]);
  });

  it('drops an incomplete trailing event', async () => {
    expect(await collect(parseSse(stream(['data: 1\n\ndata: 2'])))).toHaveLength(1);
  });

  it('cancels the body when the consumer stops', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: 1\n\ndata: 2\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const _ of parseSse(body)) {
      break;
    }

    expect(cancelled).toBe(true);
  });

  it('rejects with the abort reason', async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: 1\n\n'));
      },
    });
    const events = parseSse(body, controller.signal);

    expect((await events.next()).value).toMatchObject({ data: 1 });

    const next = events.next();

    controller.abort();

    await expect(next).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('is what the client returns for text/event-stream', async () => {
    const api = createClient({
      baseURL: 'http://test',
      fetch: async () => new Response(stream(['data: 1\n\n']), { headers: { 'content-type': 'text/event-stream' } }),
    });

    expect(await collect(await api.get('/events'))).toEqual([{ data: 1, event: undefined, id: undefined, retry: undefined }]);
  });

  it('delivers an event closed by a CR right at the end of the stream', async () => {
    expect((await collect(parseSse(stream(['data: 1\r\r'])))).map((e) => e.data)).toEqual([1]);
  });

  it('stops between events of one chunk once aborted', async () => {
    const controller = new AbortController();
    const events = parseSse(stream(['data: 1\n\ndata: 2\n\n']), controller.signal);

    expect((await events.next()).value).toMatchObject({ data: 1 });
    controller.abort();
    await expect(events.next()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels the body on return() before the first event and while a read is pending', async () => {
    const cancelled: string[] = [];
    const idle = (name: string) =>
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled.push(name);
        },
      });

    await parseSse(idle('unstarted')).return();

    const pending = parseSse(idle('pending'));
    const next = pending.next();

    await pending.return();
    await expect(next).resolves.toMatchObject({ done: true });

    expect(cancelled).toEqual(['unstarted', 'pending']);
  });

  it('cancels the body when the signal aborts before the first next(), or was aborted already', async () => {
    const cancelled: unknown[] = [];
    const idle = () =>
      new ReadableStream<Uint8Array>({
        cancel(reason) {
          cancelled.push(reason);
        },
      });
    const late = new AbortController();

    parseSse(idle(), late.signal);
    late.abort('late');
    parseSse(idle(), AbortSignal.abort('early'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cancelled).toEqual(['late', 'early']);
  });
});
