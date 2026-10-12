import { Controller, Get, Header, Post, Request, Sse } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { createTestApp, TestingError } from '../../src';
import type { SseMessage } from '@vercube/core';

/** A promise resolved from outside, to hold the SSE handler between events. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolve_) => {
    resolve = resolve_;
  });

  return { promise, resolve };
}

let gate = deferred();
let finished = false;
let aborted = false;

@Controller('/res')
class ResponseController {
  @Get('/json')
  public json(): unknown {
    return { a: 1 };
  }

  @Get('/text')
  public text(): Response {
    return new Response('<html>not json</html>', { headers: { 'content-type': 'text/html' } });
  }

  @Get('/binary')
  public binary(): Response {
    return new Response(new Uint8Array([0, 159, 146, 150]), { headers: { 'content-type': 'image/png' } });
  }

  @Post('/login')
  public login(): Response {
    const headers = new globalThis.Headers();
    headers.append('set-cookie', 'session=abc; Path=/; HttpOnly');
    headers.append('set-cookie', 'theme="dark"; Max-Age=3600');
    headers.append('set-cookie', 'old=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    return new Response(null, { status: 204, headers });
  }

  @Post('/logout')
  public logout(): Response {
    return new Response(null, { status: 204, headers: { 'set-cookie': 'session=; Max-Age=0' } });
  }

  @Get('/me')
  public me(@Header('cookie') cookie: string | null): unknown {
    return { cookie };
  }

  @Sse('/events')
  public async *events(): AsyncGenerator<SseMessage> {
    try {
      yield { event: 'greeting', id: 1, data: 'hello' };
      await gate.promise;
      yield { data: { n: 2 } };
      yield { data: 'line one\nline two' };
      finished = true;
    } finally {
      aborted = !finished;
    }
  }

  @Sse('/endless')
  public async *endless(@Request() request: Request): AsyncGenerator<SseMessage> {
    try {
      let n = 0;

      while (!request.signal.aborted) {
        yield { data: n++ };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } finally {
      aborted = true;
    }
  }
}

describe('TestResponse', () => {
  it('should read the body as many times as asked', async () => {
    await using app = await createTestApp({ controllers: [ResponseController] });

    const res = await app.get('/res/json');

    expect(await res.json()).toEqual({ a: 1 });
    expect(await res.text()).toBe('{"a":1}');
    expect(await res.json()).toEqual({ a: 1 });
    expect((await res.bytes()).byteLength).toBe(7);
    expect(res.ok).toBe(true);
    expect(res.raw).toBeInstanceOf(Response);
  });

  it('should show the body when it is not JSON', async () => {
    await using app = await createTestApp({ controllers: [ResponseController] });

    const res = await app.get('/res/text');
    const error = (await res.json().catch((error_: unknown) => error_)) as TestingError;

    expect(error).toBeInstanceOf(TestingError);
    expect(error.message).toBe('Expected a JSON body from GET http://localhost/res/text, got text/html:\n<html>not json</html>');
  });

  it('should not print a binary body into a failure message', async () => {
    await using app = await createTestApp({ controllers: [ResponseController] });

    await expect(app.get('/res/binary').expect(500)).rejects.toThrow('(4 bytes of image/png)');
  });

  it('should parse the cookies it sets', async () => {
    await using app = await createTestApp({ controllers: [ResponseController] });

    const res = await app.post('/res/login').expect(204);

    expect(res.cookies()).toEqual({ session: 'abc', theme: 'dark' });
  });

  describe('events', () => {
    it('should yield each event as it arrives', async () => {
      gate = deferred();
      finished = false;

      await using app = await createTestApp({ controllers: [ResponseController] });

      const res = await app
        .get('/res/events')
        .expect(200)
        .expect('content-type', /text\/event-stream/);
      const iterator = res.events()[Symbol.asyncIterator]();

      // the handler is still waiting on the gate, yet the first event is here
      expect((await iterator.next()).value).toEqual({ event: 'greeting', id: '1', data: 'hello' });
      expect(finished).toBe(false);

      gate.resolve();

      expect((await iterator.next()).value).toEqual({ data: '{"n":2}' });
      expect((await iterator.next()).value).toEqual({ data: 'line one\nline two' });
      expect((await iterator.next()).done).toBe(true);
      expect(finished).toBe(true);
    });

    it('should cancel the stream when the loop stops early', async () => {
      aborted = false;

      await using app = await createTestApp({ controllers: [ResponseController] });

      const res = await app.get('/res/endless');
      const seen: string[] = [];

      for await (const event of res.events()) {
        seen.push(event.data);

        if (seen.length === 3) {
          break;
        }
      }

      expect(seen).toEqual(['0', '1', '2']);
      await expect.poll(() => aborted).toBe(true);
    });

    it('should refuse to mix events() with a buffered read', async () => {
      gate = deferred();
      gate.resolve();

      await using app = await createTestApp({ controllers: [ResponseController] });

      const buffered = await app.get('/res/json');
      await buffered.text();
      expect(() => buffered.events()).toThrow(TestingError);

      const streamed = await app.get('/res/events');
      streamed.events();
      expect(() => streamed.bytes()).toThrow(TestingError);
      expect(() => streamed.events()).toThrow('only be called once');
    });

    it('should not read an event stream into a failure message', async () => {
      await using app = await createTestApp({ controllers: [ResponseController] });

      await expect(app.get('/res/endless').expect(500)).rejects.toThrow('(event stream, not read)');
    });
  });

  describe('agent', () => {
    it('should send back the cookies responses set', async () => {
      await using app = await createTestApp({ controllers: [ResponseController] });

      const agent = app.agent();

      await agent.post('/res/login').expect(204);
      expect(agent.jar.all()).toEqual({ session: 'abc', theme: 'dark' });
      expect(await (await agent.get('/res/me')).json()).toEqual({ cookie: 'session=abc; theme=dark' });

      await agent.post('/res/logout').expect(204);
      expect(await (await agent.get('/res/me')).json()).toEqual({ cookie: 'theme=dark' });
    });

    it('should keep the cookies of two agents apart', async () => {
      await using app = await createTestApp({ controllers: [ResponseController] });

      const first = app.agent();
      const second = app.agent();

      await first.post('/res/login');

      expect(await (await second.get('/res/me')).json()).toEqual({ cookie: null });
      expect(await (await app.get('/res/me')).json()).toEqual({ cookie: null });
    });

    it('should add cookies set on the request to the jar ones', async () => {
      await using app = await createTestApp({ controllers: [ResponseController] });

      const agent = app.agent();
      await agent.post('/res/login');

      const res = await agent.get('/res/me').cookie('extra', '1');

      expect(await res.json()).toEqual({ cookie: 'session=abc; theme=dark; extra=1' });
    });
  });
});
