import { describe, expect, it } from 'vitest';
import { BaseMiddleware, Controller, createApp, Get, Middleware, NotFoundError, Redirect, SetHeader, Status } from '../../../src';

class CorsMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    response.headers.set('access-control-allow-origin', '*');
  }
}

@Controller('/paths')
@Middleware(CorsMiddleware)
class HeaderPathsController {
  @Get('/old')
  @Redirect('/new', 302)
  @SetHeader('x-set', 'yes')
  public old(): void {}

  @Get('/missing')
  @SetHeader('Cache-Control', 'public, max-age=86400')
  @SetHeader('ETag', '"v1"')
  public missing(): never {
    throw new NotFoundError();
  }

  @Get('/own-response')
  @Redirect('/elsewhere', 302)
  public ownResponse(): Response {
    return new Response('hi');
  }

  @Get('/created')
  @Status(201)
  public created(): Response {
    return new Response('hi');
  }
}

const boot = () => createApp({ cfg: { requestLogging: false }, setup: (app) => app.container.bind(HeaderPathsController) });

describe('response headers outside the plain handler path', () => {
  it('should keep middleware and @SetHeader headers on a redirect, with an empty body', async () => {
    const app = await boot();

    const response = await app.fetch(new Request('http://localhost/paths/old'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/new');
    expect(response.headers.get('x-set')).toBe('yes');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.text()).toBe('');
  });

  it('should not copy caching and validator headers onto an error response', async () => {
    const app = await boot();

    const response = await app.fetch(new Request('http://localhost/paths/missing'));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should not put Location on a handler response that is not a redirect', async () => {
    const app = await boot();

    const response = await app.fetch(new Request('http://localhost/paths/own-response'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('should leave the status of a Response returned by the handler alone', async () => {
    const app = await boot();

    const response = await app.fetch(new Request('http://localhost/paths/created'));

    expect(response.status).toBe(200);
  });
});
