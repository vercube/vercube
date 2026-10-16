import { Body, Controller, Get, Header, Headers, Post, QueryParam, Request, SetHeader, Status } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { createTestApp, TestingError } from '../../src';
import type { TestApp } from '../../src';

@Controller('/echo')
class EchoController {
  @Get('/query')
  public query(@Request() request: Request, @QueryParam({ name: 'q' }) q: string): unknown {
    const url = new URL(request.url);
    return { q, tags: url.searchParams.getAll('tag'), page: url.searchParams.get('page'), flag: url.searchParams.get('flag') };
  }

  @Get('/headers')
  public headers(@Headers() headers: Record<string, string>, @Header('x-one') one: string): unknown {
    return { one, two: headers['x-two'], authorization: headers.authorization, cookie: headers.cookie };
  }

  @Post('/json')
  public json(@Body() body: unknown, @Header('content-type') contentType: string): unknown {
    return { body, contentType };
  }

  @Post('/raw')
  public async raw(@Request() request: Request): Promise<unknown> {
    return { body: await request.text(), contentType: request.headers.get('content-type') };
  }

  @Post('/form')
  public async form(@Request() request: Request): Promise<unknown> {
    // @MultipartFormData() does not parse anything yet, so read it by hand
    const data = await request.formData();
    const avatar = data.get('avatar') as File;

    return { fields: [...data.keys()].sort(), name: data.get('name'), avatar: { type: avatar.type, size: avatar.size } };
  }

  @Get('/created')
  @Status(201)
  @SetHeader('x-trace', 'abc-123')
  public created(): unknown {
    return { ok: true };
  }

  @Post('/fail')
  @Status(422)
  public fail(): unknown {
    return { errors: [{ path: 'name', message: 'Too short' }] };
  }
}

const boot = (): Promise<TestApp> => createTestApp({ controllers: [EchoController] });

describe('TestRequest', () => {
  it('should encode the query, arrays included', async () => {
    await using app = await boot();

    const res = await app
      .get('/echo/query')
      .query({ q: 'ada lovelace', tag: ['a', 'b'], page: 2, flag: true, skipped: undefined });

    expect(await res.json()).toEqual({ q: 'ada lovelace', tags: ['a', 'b'], page: '2', flag: 'true' });
  });

  it('should keep a query already in the path', async () => {
    await using app = await boot();

    const res = await app.get('/echo/query?tag=x').query({ tag: 'y' });

    expect(await res.json()).toMatchObject({ tags: ['x', 'y'] });
  });

  it('should send headers, a bearer token and cookies', async () => {
    await using app = await boot();

    const res = await app
      .get('/echo/headers')
      .header('x-one', '1')
      .headers({ 'x-two': '2' })
      .bearer('secret-token')
      .cookie('a', '1')
      .cookie('b', '2');

    expect(await res.json()).toEqual({ one: '1', two: '2', authorization: 'Bearer secret-token', cookie: 'a=1; b=2' });
  });

  it('should send a JSON body to @Body()', async () => {
    await using app = await boot();

    const res = await app.post('/echo/json').json({ name: 'Ada' });

    expect(await res.json()).toEqual({ body: { name: 'Ada' }, contentType: 'application/json' });
  });

  it('should keep a content type set by hand', async () => {
    await using app = await boot();

    const res = await app.post('/echo/json').header('content-type', 'application/vnd.api+json').json({ a: 1 });

    expect(await res.json()).toMatchObject({ contentType: 'application/vnd.api+json' });
  });

  it('should send text, urlencoded and raw bodies', async () => {
    await using app = await boot();

    expect(await (await app.post('/echo/raw').text('hello')).json()).toEqual({ body: 'hello', contentType: 'text/plain' });
    expect(await (await app.post('/echo/raw').text('<a/>', 'application/xml')).json()).toEqual({
      body: '<a/>',
      contentType: 'application/xml',
    });
    expect(await (await app.post('/echo/raw').urlencoded({ a: '1', b: 'x y' })).json()).toEqual({
      body: 'a=1&b=x+y',
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    });
    expect(
      await (
        await app
          .post('/echo/raw')
          .body(new Uint8Array([104, 105]))
          .header('content-type', 'application/octet-stream')
      ).json(),
    ).toEqual({
      body: 'hi',
      contentType: 'application/octet-stream',
    });
  });

  it('should send multipart form data to @MultipartFormData()', async () => {
    await using app = await boot();

    const res = await app.post('/echo/form').form({ name: 'Ada', avatar: new Blob(['png'], { type: 'image/png' }) });

    expect(await res.json()).toEqual({ fields: ['avatar', 'name'], name: 'Ada', avatar: { type: 'image/png', size: 3 } });
  });

  it('should send once however many times it is awaited', async () => {
    await using app = await boot();

    let sent = 0;
    const original = app.app.fetch.bind(app.app);
    app.app.fetch = (request: globalThis.Request) => {
      sent++;
      return original(request);
    };

    const request = app.get('/echo/created');

    const [first, second] = await Promise.all([request, request]);
    await request.send();

    expect(first).toBe(second);
    expect(sent).toBe(1);
  });

  it('should resolve absolute URLs and a custom base URL', async () => {
    await using app = await createTestApp({ controllers: [EchoController], baseUrl: 'https://api.example.com' });

    const res = await app.get('/echo/created');
    expect(res.request.url).toBe('https://api.example.com/echo/created');

    const absolute = await app.get('http://other.test/echo/created');
    expect(absolute.request.url).toBe('http://other.test/echo/created');
  });

  it('should refuse .as() without an extension', async () => {
    await using app = await boot();

    await expect(app.get('/echo/created').as({ id: 1 })).rejects.toThrow(/testAuth\(\) from @vercube\/testing\/auth/);
  });

  it('should pass the raw fetch through', async () => {
    await using app = await boot();

    expect((await app.fetch('/echo/created')).status).toBe(201);
    expect((await app.fetch(new globalThis.Request('http://localhost/echo/created'))).status).toBe(201);
  });

  describe('expect', () => {
    it('should pass on a matching status and headers', async () => {
      await using app = await boot();

      const res = await app
        .get('/echo/created')
        .expect(201)
        .expect('x-trace', 'abc-123')
        .expect('x-trace', /^abc-\d+$/)
        .expect(async (response) => {
          expect(await response.json()).toEqual({ ok: true });
        });

      expect(res.status).toBe(201);
    });

    it('should describe the exchange when the status does not match', async () => {
      await using app = await boot();

      const error = await app
        .post('/echo/fail')
        .json({ name: 'A' })
        .expect(200)
        .catch((error_: unknown) => error_);

      expect(error).toBeInstanceOf(TestingError);
      expect((error as TestingError).message).toMatchInlineSnapshot(`
        "Expected status 200, got 422

          POST http://localhost/echo/fail
          request  content-type: application/json
                   {"name":"A"}
          response content-type: application/json
                   {"errors":[{"path":"name","message":"Too short"}]}"
      `);
      expect((error as TestingError).response?.status).toBe(422);
      expect((error as TestingError).request?.method).toBe('POST');
    });

    it('should withhold credentials', async () => {
      await using app = await boot();

      const error = await app
        .get('/echo/headers')
        .bearer('very-secret')
        .cookie('session', 'also-secret')
        .header('x-api-key', 'key-secret')
        .expect(500)
        .catch((error_: unknown) => error_ as TestingError);

      const { message } = error as TestingError;

      expect(message).toContain('authorization: <redacted>');
      expect(message).toContain('cookie: <redacted>');
      expect(message).toContain('x-api-key: <redacted>');
      // the response echoes them back in its body, which is not a header
      expect(message.split('\n').filter((line) => line.includes('very-secret') && line.includes('authorization:'))).toEqual([]);
    });

    it('should report a header that does not match', async () => {
      await using app = await boot();

      await expect(app.get('/echo/created').expect('x-trace', 'nope')).rejects.toThrow(
        'Expected header x-trace to be "nope", got "abc-123"',
      );
      await expect(app.get('/echo/created').expect('x-trace', /^z/)).rejects.toThrow(
        'Expected header x-trace to match /^z/, got "abc-123"',
      );
      await expect(app.get('/echo/created').expect('x-missing', 'a')).rejects.toThrow(
        'Expected header x-missing to be "a", got no such header',
      );
    });

    it('should keep the runner error of a failed check and add the exchange', async () => {
      await using app = await boot();

      const error = (await app
        .get('/echo/created')
        .expect(async (response) => {
          expect(await response.json()).toEqual({ ok: false });
        })
        .catch((error_: unknown) => error_)) as Error;

      expect(error).not.toBeInstanceOf(TestingError);
      expect(error.message).toContain('expected { ok: true } to deeply equal { ok: false }');
      expect(error.message).toContain('GET http://localhost/echo/created');
    });

    it('should run the expectations in order', async () => {
      await using app = await boot();

      const seen: string[] = [];

      await expect(
        app
          .get('/echo/created')
          .expect(() => void seen.push('first'))
          .expect(500)
          .expect(() => void seen.push('never')),
      ).rejects.toThrow('Expected status 500, got 201');

      expect(seen).toEqual(['first']);
    });
  });
});
