import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaseMiddleware, Controller, createApp, Get, Middleware, Response as Res, SetHeader, UnauthorizedError } from '../../src';
import type { App } from '../../src';
import type { AddressInfo } from 'node:net';

class CorsMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    response.headers.set('access-control-allow-origin', '*');
    response.headers.set('cache-control', 'no-store');
    response.headers.set('vary', 'Origin');
    response.headers.append('set-cookie', 'session=abc');
    response.headers.append('set-cookie', 'csrf=xyz');
  }

  public override onResponse(_request: Request, response: Response): void {
    response.headers.set('x-after', 'yes');
  }
}

class DenyMiddleware extends BaseMiddleware {
  public override onRequest(): Response {
    return new Response('denied', { status: 403 });
  }
}

const upstream = createServer((_request, response) => {
  response.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' });
  response.end(gzipSync('proxied'));
});

@Controller('/headers')
@Middleware(CorsMiddleware)
class HeadersController {
  @Get('/json')
  public json(): unknown {
    return { ok: true };
  }

  @Get('/raw')
  @SetHeader('x-set-header', 'yes')
  public raw(): Response {
    return new Response('raw', { status: 201 });
  }

  @Get('/same-cookie')
  public sameCookie(): Response {
    return new Response('raw', { headers: { 'set-cookie': 'session=from-handler; HttpOnly' } });
  }

  @Get('/file')
  public file(): Response {
    return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  }

  @Get('/typed-file')
  @SetHeader('Content-Type', 'application/pdf')
  public typedFile(): Response {
    return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  }

  @Get('/handler-wins')
  public handlerWins(): Response {
    return new Response('raw', { headers: { 'cache-control': 'max-age=60', 'set-cookie': 'theme=dark' } });
  }

  @Get('/via-response-arg')
  public viaResponseArg(@Res() response: Response): Response {
    response.headers.set('access-control-allow-origin', 'https://app.example');
    return new Response('raw');
  }

  @Get('/immutable')
  public immutable(): Response {
    return Response.redirect('http://localhost/target', 302);
  }

  @Get('/vary')
  public vary(): Response {
    return new Response('raw', { headers: { vary: 'Accept-Encoding' } });
  }

  @Get('/vary-origin')
  public varyOrigin(): Response {
    return new Response('raw', { headers: { vary: 'Accept-Encoding, origin' } });
  }

  @Get('/proxied')
  public proxied(): Promise<Response> {
    return globalThis.fetch(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
  }

  @Get('/network-error')
  public networkError(): Response {
    return Response.error();
  }

  @Get('/throws')
  @SetHeader('Content-Type', 'application/pdf')
  public throws(): Response {
    throw new UnauthorizedError('nope');
  }
}

@Controller('/denied')
@Middleware(CorsMiddleware)
@Middleware(DenyMiddleware)
class DeniedController {
  @Get('/')
  public denied(): unknown {
    return { ok: true };
  }
}

describe('Headers of handler-built responses', () => {
  let app: App;

  beforeAll(async () => {
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));

    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(HeadersController);
        instance.container.bind(DeniedController);
      },
    });
  });

  afterAll(() => {
    upstream.close();
  });

  const fetch = (path: string, prefix = '/headers') => app.fetch(new globalThis.Request(`http://localhost${prefix}${path}`));

  it('should copy middleware, action and onResponse headers onto a returned Response', async () => {
    const response = await fetch('/raw');

    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('x-set-header')).toBe('yes');
    expect(response.headers.get('x-after')).toBe('yes');
    expect(await response.text()).toBe('raw');
  });

  it('should keep headers set by the handler', async () => {
    const response = await fetch('/handler-wins');

    expect(response.headers.get('cache-control')).toBe('max-age=60');
  });

  it('should keep cookies from both the handler and middlewares', async () => {
    const response = await fetch('/handler-wins');

    expect(response.headers.getSetCookie()).toEqual(['theme=dark', 'session=abc', 'csrf=xyz']);
  });

  it('should keep the handler cookie when a middleware sets one with the same name', async () => {
    const response = await fetch('/same-cookie');

    expect(response.headers.getSetCookie()).toEqual(['session=from-handler; HttpOnly', 'csrf=xyz']);
  });

  it('should not copy the default Content-Type onto a response without one', async () => {
    const response = await fetch('/file');

    expect(response.headers.get('content-type')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should copy a Content-Type that was set explicitly', async () => {
    const response = await fetch('/typed-file');

    expect(response.headers.get('content-type')).toBe('application/pdf');
  });

  it('should keep the Content-Type of the handler response', async () => {
    const response = await fetch('/raw');

    expect(response.headers.get('content-type')).toBe('text/plain;charset=UTF-8');
  });

  it('should copy the latest value set through @Response()', async () => {
    const response = await fetch('/via-response-arg');

    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  it('should copy headers onto a response with immutable headers', async () => {
    const response = await fetch('/immutable');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/target');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should leave serialized handler results unchanged', async () => {
    const response = await fetch('/json');

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('should merge the Vary header of the handler and of middlewares', async () => {
    const response = await fetch('/vary');

    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin');
  });

  it('should not repeat a Vary token the handler already varies on', async () => {
    const response = await fetch('/vary-origin');

    expect(response.headers.get('vary')).toBe('Accept-Encoding, origin');
  });

  it('should drop the stale encoding of a fetched response', async () => {
    const response = await fetch('/proxied');

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.text()).toBe('proxied');
  });

  it('should return a network error response untouched', async () => {
    const response = await fetch('/network-error');

    expect(response.type).toBe('error');
  });

  it('should copy middleware headers onto an error response, except those describing the body', async () => {
    const response = await fetch('/throws');

    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.getSetCookie()).toEqual(['session=abc', 'csrf=xyz']);
    expect(response.headers.get('content-type')).not.toBe('application/pdf');
  });

  it('should copy middleware headers onto a response a middleware ended the request with', async () => {
    const response = await fetch('/', '/denied');

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.text()).toBe('denied');
  });
});
