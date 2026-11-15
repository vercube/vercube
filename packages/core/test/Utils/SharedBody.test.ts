import { describe, expect, it, vi } from 'vitest';
import {
  BaseMiddleware,
  Body,
  Controller,
  createApp,
  Middleware,
  MultipartFormData,
  Post,
  Request as RequestArg,
  Router,
} from '../../src';
import { readSharedBytes, readSharedText } from '../../src/Utils/SharedBody';
import type { App } from '../../src';

const seen: unknown[] = [];

class ReadsAfterMiddleware extends BaseMiddleware {
  public override async onResponse(request: Request): Promise<void> {
    seen.push(await request.json());
  }
}

class NoopMiddleware extends BaseMiddleware {
  public override onRequest(): void {}
}

class QuietAfterMiddleware extends BaseMiddleware {
  public static readonly readsBody = false;

  public override onResponse(): void {}
}

@Controller('/shared')
class SharedController {
  @Post('/before-only')
  @Middleware(NoopMiddleware)
  public beforeOnly(@Body() body: unknown): unknown {
    return body;
  }

  @Post('/quiet-after')
  @Middleware(QuietAfterMiddleware)
  public quietAfter(@Body() body: unknown): unknown {
    return body;
  }

  @Post('/after')
  @Middleware(ReadsAfterMiddleware)
  public after(@Body() body: unknown): unknown {
    return body;
  }

  @Post('/twice')
  public twice(@Body() first: Record<string, unknown>, @Body() second: Record<string, unknown>): unknown {
    return { same: first === second, first, second };
  }

  @Post('/raw')
  public async raw(@Body() body: unknown, @RequestArg() request: Request): Promise<unknown> {
    const decoder = new TextDecoder();

    return {
      body,
      used: request.bodyUsed,
      text: await request.text(),
      json: await request.json(),
      bytes: decoder.decode(await request.bytes()),
      arrayBuffer: decoder.decode(await request.arrayBuffer()),
      blob: await (await request.blob()).text(),
      clone: await request.clone().text(),
      stream: await new Response(request.body).text(),
    };
  }

  @Post('/form')
  @Middleware(NoopMiddleware)
  public async form(@Body() body: unknown, @RequestArg() request: Request): Promise<unknown> {
    return { body, name: (await request.formData()).get('name') };
  }

  @Post('/multipart')
  @Middleware(NoopMiddleware)
  public async multipart(@MultipartFormData() fields: Record<string, unknown>, @RequestArg() request: Request): Promise<unknown> {
    return { field: fields.field, again: (await request.formData()).get('field'), size: (await request.bytes()).byteLength };
  }

  @Post('/text')
  @Middleware(NoopMiddleware)
  public async text(@Body() body: unknown, @RequestArg() request: Request): Promise<unknown> {
    return { body, again: await request.text() };
  }
}

/**
 * Creates an application serving {@link SharedController}.
 *
 * @param {number} [bodyLimit] - The body limit
 * @returns {Promise<App>} The application
 */
async function createSharedApp(bodyLimit?: number): Promise<App> {
  return createApp({
    cfg: { requestLogging: false, requestContext: false, server: { bodyLimit } } as never,
    setup: (app) => {
      app.container.bind(SharedController);
    },
  });
}

/**
 * Builds a JSON request.
 *
 * @param {string} path - The request path
 * @param {unknown} body - The body
 * @returns {Request} The request
 */
function json(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('shared request body', () => {
  it('lets a middleware read the body after the handler did', async () => {
    const app = await createSharedApp();

    seen.length = 0;

    const response = await app.fetch(json('/shared/after', { a: 1 }));

    expect(await response.json()).toEqual({ a: 1 });
    expect(seen).toEqual([{ a: 1 }]);
  });

  it('shares the body only where something can read it after the argument did', async () => {
    const app = await createSharedApp();
    const router = app.container.get(Router);
    const shares = (path: string): boolean | undefined => router.match('POST', path)!.data.cloneBody;

    expect(shares('/shared/after')).toBe(true);
    expect(shares('/shared/twice')).toBe(true);
    expect(shares('/shared/raw')).toBe(true);
    // a before middleware is done by the time the body is read
    expect(shares('/shared/before-only')).toBe(false);
    // an after middleware that declared it never reads the body
    expect(shares('/shared/quiet-after')).toBe(false);

    const response = await app.fetch(json('/shared/before-only', { a: 1 }));
    expect(await response.json()).toEqual({ a: 1 });
  });

  it('never clones the request', async () => {
    const app = await createSharedApp();
    const request = json('/shared/after', { a: 1 });
    const clone = vi.spyOn(request, 'clone');

    await app.fetch(request);

    expect(clone).not.toHaveBeenCalled();
  });

  it('gives each body argument its own value', async () => {
    const app = await createSharedApp();
    const response = await app.fetch(json('/shared/twice', { a: 1 }));

    expect(await response.json()).toEqual({ same: false, first: { a: 1 }, second: { a: 1 } });
  });

  it('serves every reader of the raw request, any number of times', async () => {
    const app = await createSharedApp();
    const text = JSON.stringify({ name: 'zażółć' });
    const response = await app.fetch(json('/shared/raw', { name: 'zażółć' }));

    expect(await response.json()).toEqual({
      body: { name: 'zażółć' },
      used: false,
      text,
      json: { name: 'zażółć' },
      bytes: text,
      arrayBuffer: text,
      blob: text,
      clone: text,
      stream: text,
    });
  });

  it('shares a urlencoded body', async () => {
    const app = await createSharedApp();
    const response = await app.fetch(
      new Request('http://localhost/shared/form', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'name=John&tag=a&tag=b',
      }),
    );

    expect(await response.json()).toEqual({ body: { name: 'John', tag: ['a', 'b'] }, name: 'John' });
  });

  it('shares a text body', async () => {
    const app = await createSharedApp();
    const response = await app.fetch(
      new Request('http://localhost/shared/text', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' }),
    );

    expect(await response.json()).toEqual({ body: 'hello', again: 'hello' });
  });

  it('shares a multipart body', async () => {
    const app = await createSharedApp();
    const form = new FormData();

    form.append('field', 'value');
    form.append('file', new Blob([new Uint8Array([0, 255, 254, 1])]), 'data.bin');

    const response = await app.fetch(new Request('http://localhost/shared/multipart', { method: 'POST', body: form }));
    const payload = await response.json();

    expect(payload).toMatchObject({ field: 'value', again: 'value' });
    expect(payload.size).toBeGreaterThan(4);
  });

  it('enforces the body limit on a shared body, with and without a declared length', async () => {
    const app = await createSharedApp(8);

    const declared = await app.fetch(json('/shared/after', { name: 'far too long' }));
    expect(declared.status).toBe(413);

    const chunked = await app.fetch(
      new Request('http://localhost/shared/after', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new Blob([JSON.stringify({ name: 'far too long' })]).stream(),
        duplex: 'half',
      } as RequestInit),
    );
    expect(chunked.status).toBe(413);

    const small = await app.fetch(json('/shared/after', 1));
    expect(small.status).toBe(200);
  });

  it('derives text from bytes and bytes from text', async () => {
    const asText = new Request('http://localhost/', { method: 'POST', body: 'zażółć' });

    expect(await readSharedText(asText, undefined)).toBe('zażółć');
    expect(new TextDecoder().decode(await readSharedBytes(asText, undefined))).toBe('zażółć');

    const asBytes = new Request('http://localhost/', { method: 'POST', body: 'zażółć' });

    expect(new TextDecoder().decode(await readSharedBytes(asBytes, undefined))).toBe('zażółć');
    expect(await readSharedText(asBytes, undefined)).toBe('zażółć');
    expect(await asBytes.text()).toBe('zażółć');
  });

  it('hands every reader the same failure', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: 'far too long',
      headers: { 'content-length': '12' },
    });

    await expect(readSharedText(request, 4)).rejects.toThrow('Request body is too large');
    await expect(request.text()).rejects.toThrow('Request body is too large');
  });
});
