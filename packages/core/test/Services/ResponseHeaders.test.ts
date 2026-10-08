import { beforeAll, describe, expect, it } from 'vitest';
import { BaseMiddleware, Controller, createApp, Get, Middleware, Response as Res, SetHeader } from '../../src';
import type { App } from '../../src';

class CorsMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    response.headers.set('access-control-allow-origin', '*');
    response.headers.set('cache-control', 'no-store');
    response.headers.append('set-cookie', 'session=abc');
    response.headers.append('set-cookie', 'csrf=xyz');
  }

  public override onResponse(_request: Request, response: Response): void {
    response.headers.set('x-after', 'yes');
  }
}

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
}

describe('Headers of handler-built responses', () => {
  let app: App;

  beforeAll(async () => {
    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(HeadersController);
      },
    });
  });

  const fetch = (path: string) => app.fetch(new globalThis.Request(`http://localhost/headers${path}`));

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
});
