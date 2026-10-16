import { describe, expect, it } from 'vitest';
import { BaseMiddleware, Controller, createApp, Get, initializeMetadata, Middleware, SetHeader, Status } from '../../src';

@Controller('/r')
class ActionsController {
  @Get('/')
  @SetHeader('x', '1')
  @Status(201)
  public r() {
    return { ok: true };
  }
}

class BaseGuard extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    response.headers.set('x-base', '1');
  }
}

class AdminGuard extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    response.headers.set('x-admin', '1');
  }
}

@Middleware(BaseGuard)
class BaseController {
  @Get('/shared')
  public shared() {
    return { shared: true };
  }
}

@Controller('/a')
class AdminController extends BaseController {
  @Get('/admin')
  @Middleware(AdminGuard)
  public admin() {
    return { admin: true };
  }
}

@Controller('/b')
class PublicController extends BaseController {}

describe('metadata isolation', () => {
  it('should not pile up actions when a second application initializes the class', async () => {
    const first = await createApp({ cfg: { requestLogging: false }, setup: (app) => app.container.bind(ActionsController) });
    first.container.get(ActionsController);
    const second = await createApp({ cfg: { requestLogging: false }, setup: (app) => app.container.bind(ActionsController) });
    second.container.get(ActionsController);

    expect(initializeMetadata(ActionsController.prototype).__methods.r.actions).toHaveLength(2);

    const response = await first.fetch(new Request('http://localhost/r'));
    expect(response.status).toBe(201);
    expect(response.headers.get('x')).toBe('1');
  });

  it('should keep subclass decorators out of the parent and its siblings', async () => {
    const app = await createApp({
      cfg: { requestLogging: false },
      setup: (app) => {
        app.container.bind(AdminController);
        app.container.bind(PublicController);
      },
    });

    // the subclass method never reaches the parent or the sibling
    expect(initializeMetadata(BaseController.prototype).__methods.admin).toBeUndefined();
    expect(initializeMetadata(PublicController.prototype).__methods.admin).toBeUndefined();
    expect((BaseController.prototype as { __decorators?: unknown[] }).__decorators).toHaveLength(1);

    const admin = await app.fetch(new Request('http://localhost/a/admin'));
    expect(admin.status).toBe(200);
    expect(admin.headers.get('x-admin')).toBe('1');
    expect(admin.headers.get('x-base')).toBe('1');

    // inherited route and middleware, without the sibling's middleware
    const shared = await app.fetch(new Request('http://localhost/b/shared'));
    expect(shared.status).toBe(200);
    expect(shared.headers.get('x-base')).toBe('1');
    expect(shared.headers.get('x-admin')).toBeNull();

    expect((await app.fetch(new Request('http://localhost/b/admin'))).status).toBe(404);
  });
});
