import { describe, expect, it } from 'vitest';
import { BaseMiddleware, Body, Controller, createApp, Middleware, Post, UnauthorizedError } from '../../src';
import type { App } from '../../src';

class AuthMiddleware extends BaseMiddleware {
  public override onRequest(request: Request, response: Response): void {
    response.headers.set('access-control-allow-origin', '*');

    if (!request.headers.get('authorization')) {
      throw new UnauthorizedError('Unauthorized');
    }
  }
}

@Controller('/body-pipeline')
class BodyPipelineController {
  @Post('/protected')
  @Middleware(AuthMiddleware)
  public protected(@Body() body: unknown): unknown {
    return { body };
  }

  @Post('/form')
  public form(@Body() body: unknown): unknown {
    return { body };
  }
}

const createBodyApp = (bodyLimit?: number | false): Promise<App> =>
  createApp({
    cfg: { requestLogging: false, server: { bodyLimit } },
    setup: (instance) => {
      instance.container.bind(BodyPipelineController);
    },
  });

const post = (path: string, body: string, headers: Record<string, string>): Request =>
  new Request(`http://localhost/body-pipeline${path}`, { method: 'POST', body, headers });

describe('@Body() pipeline', () => {
  it('should let a before middleware reject the request before the body is parsed', async () => {
    const app = await createBodyApp();

    const response = await app.fetch(post('/protected', '{oops', { 'content-type': 'application/json' }));

    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should still parse the body once the middleware lets the request through', async () => {
    const app = await createBodyApp();

    const response = await app.fetch(post('/protected', '{"a":1}', { 'content-type': 'application/json', authorization: 'x' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ body: { a: 1 } });
  });

  it('should parse urlencoded bodies', async () => {
    const app = await createBodyApp();

    const response = await app.fetch(post('/form', 'a=1', { 'content-type': 'application/x-www-form-urlencoded' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ body: { a: '1' } });
  });

  it('should answer 415 for an unsupported content type', async () => {
    const app = await createBodyApp();

    const response = await app.fetch(post('/form', '<a/>', { 'content-type': 'application/xml' }));

    expect(response.status).toBe(415);
  });

  it('should answer 413 for a body over the configured limit', async () => {
    const app = await createBodyApp(4);

    const response = await app.fetch(post('/form', '{"a":1}', { 'content-type': 'application/json', 'content-length': '7' }));

    expect(response.status).toBe(413);
  });

  it('should not limit the body when the limit is disabled', async () => {
    const app = await createBodyApp(false);
    const value = 'a'.repeat(2 * 1024 * 1024);

    const response = await app.fetch(post('/form', JSON.stringify({ value }), { 'content-type': 'application/json' }));

    expect(response.status).toBe(200);
  });
});
