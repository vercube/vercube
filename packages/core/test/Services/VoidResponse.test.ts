import { beforeAll, describe, expect, it } from 'vitest';
import { BaseMiddleware, Controller, createApp, Delete, Get, Middleware, Post, SetHeader, Status } from '../../src';
import type { App } from '../../src';

class StampMiddleware extends BaseMiddleware {
  public override onResponse(_request: Request, response: Response): void {
    response.headers.set('x-stamp', 'yes');
  }
}

@Controller('/void')
class VoidController {
  @Get('/sync')
  public sync(): void {}

  @Delete('/async')
  public async async(): Promise<void> {}

  @Get('/null')
  public nothing(): null {
    return null;
  }

  @Post('/created')
  @Status(201)
  public created(): void {}

  @Get('/header')
  @SetHeader('x-custom', 'value')
  public header(): void {}

  @Get('/middleware')
  @Middleware(StampMiddleware)
  public middleware(): void {}
}

describe('Handlers returning undefined', () => {
  let app: App;

  beforeAll(async () => {
    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(VoidController);
      },
    });
  });

  const request = (path: string, method = 'GET'): Promise<Response> =>
    Promise.resolve(app.fetch(new globalThis.Request(`http://localhost/void${path}`, { method })));

  it('should answer 204 without a content type on a simple route', async () => {
    const response = await request('/sync');

    expect(response.status).toBe(204);
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it('should answer 204 for an async handler resolving to undefined', async () => {
    const response = await request('/async', 'DELETE');

    expect(response.status).toBe(204);
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it('should still serialize null as JSON', async () => {
    const response = await request('/null');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toBeNull();
  });

  it('should keep a status set with @Status()', async () => {
    const response = await request('/created', 'POST');

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it('should answer 204 and keep headers set by actions', async () => {
    const response = await request('/header');

    expect(response.status).toBe(204);
    expect(response.headers.get('x-custom')).toBe('value');
    expect(response.headers.get('content-type')).toBeNull();
  });

  it('should answer 204 on a route with middlewares', async () => {
    const response = await request('/middleware');

    expect(response.status).toBe(204);
    expect(response.headers.get('x-stamp')).toBe('yes');
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('');
  });
});
