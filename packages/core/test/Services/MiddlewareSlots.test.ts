import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BaseMiddleware,
  Controller,
  createApp,
  Get,
  GlobalMiddlewareRegistry,
  Middleware,
  Router,
  TooManyRequestsError,
  getRouteErrors,
} from '../../src';
import { addMetadataMiddleware, initializeMetadata, initializeMetadataMethod } from '../../src/Utils/Utils';
import type { App, MetadataTypes, MiddlewareOptions } from '../../src';

const SLOT = 'test:limit';

/** Records which entry of the slot ran, by its args. */
class LimitMiddleware extends BaseMiddleware<{ name: string }> {
  public static readonly implicitErrors = [{ error: TooManyRequestsError, module: '@vercube/core' }];

  public override onRequest(_request: Request, response: Response, args: MiddlewareOptions<{ name: string }>): void {
    response.headers.append('x-limit', args.middlewareArgs!.name);
  }
}

/** An unrelated middleware that must not be touched by slots. */
class TagMiddleware extends BaseMiddleware<{ tag: string }> {
  public override onRequest(_request: Request, response: Response, args: MiddlewareOptions<{ tag: string }>): void {
    response.headers.append('x-tag', args.middlewareArgs!.tag);
  }
}

/**
 * A decorator in the shape `@RateLimit()` has: a slotted middleware entry on
 * the class or the method, `false` to opt out.
 */
function Limit(name: string | false): Function {
  return function (target: Function | object, propertyName?: string): void {
    const ctx = (propertyName ? target : (target as Function).prototype) as MetadataTypes.Metadata;
    const meta = initializeMetadata(ctx);

    if (propertyName) {
      initializeMetadataMethod(ctx, propertyName);
    }

    addMetadataMiddleware(meta, {
      target: propertyName ?? '__global__',
      middleware: LimitMiddleware,
      slot: SLOT,
      ...(name === false ? { skip: true } : { args: { name } }),
    });
  };
}

@Controller('/plain')
class PlainController {
  @Get('/inherit')
  public inherit(): string {
    return 'ok';
  }

  @Get('/own')
  @Limit('method')
  public own(): string {
    return 'ok';
  }

  @Get('/off')
  @Limit(false)
  public off(): string {
    return 'ok';
  }
}

@Controller('/limited')
@Limit('class')
@Middleware(TagMiddleware, { args: { tag: 'class' } })
class LimitedController {
  @Get('/inherit')
  @Middleware(TagMiddleware, { args: { tag: 'method' } })
  public inherit(): string {
    return 'ok';
  }

  @Get('/own')
  @Limit('outer')
  @Limit('inner')
  public own(): string {
    return 'ok';
  }

  @Get('/off')
  @Limit(false)
  public off(): string {
    return 'ok';
  }
}

@Controller('/child')
@Limit('child')
class ChildController extends LimitedController {}

@Controller('/bare')
class BareController {
  @Get('/off')
  @Limit(false)
  public off(): string {
    return 'ok';
  }
}

describe('middleware slots', () => {
  let app: App;

  const get = async (path: string): Promise<{ limit: string | null; tag: string | null }> => {
    const response = await app.fetch(new globalThis.Request(`http://localhost${path}`));

    return { limit: response.headers.get('x-limit'), tag: response.headers.get('x-tag') };
  };

  beforeAll(async () => {
    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(LimitMiddleware, {
          slot: SLOT,
          args: { name: 'global' },
        });
        instance.container.bind(PlainController);
        instance.container.bind(LimitedController);
        instance.container.bind(ChildController);
      },
    });
  });

  afterAll(async () => {
    await app.close?.();
  });

  it('should run the app-wide entry on a route that sets nothing', async () => {
    expect((await get('/plain/inherit')).limit).toBe('global');
  });

  it('should let the method replace the app-wide entry', async () => {
    expect((await get('/plain/own')).limit).toBe('method');
  });

  it('should let the controller replace the app-wide entry, and the method replace the controller', async () => {
    expect((await get('/limited/inherit')).limit).toBe('class');
    expect((await get('/limited/own')).limit).toBe('inner');
  });

  it('should keep only the decorator closest to the method when one is applied twice', async () => {
    const meta = (LimitedController.prototype as unknown as MetadataTypes.Metadata).__metadata!;

    expect(meta.__middlewares.filter((entry) => entry.target === 'own' && entry.slot === SLOT)).toHaveLength(1);
  });

  it('should empty the slot on a skipped route, under the app and under a controller', async () => {
    expect((await get('/plain/off')).limit).toBeNull();
    expect((await get('/limited/off')).limit).toBeNull();
  });

  it('should leave middlewares without a slot alone', async () => {
    expect((await get('/limited/inherit')).tag).toBe('class, method');
  });

  it('should let a subclass replace the controller entry it inherited, without touching the parent', async () => {
    expect((await get('/child/inherit')).limit).toBe('child');
    expect((await get('/child/own')).limit).toBe('inner');
    expect((await get('/limited/inherit')).limit).toBe('class');
  });

  it('should apply the app-wide entry to unmatched requests', async () => {
    expect((await get('/nowhere')).limit).toBe('global');
  });

  it('should list the errors a slotted middleware declares only where it runs', () => {
    const routes = app.container.get(Router).routes;
    const errorsOf = (path: string): number[] => {
      const route = routes.find((entry) => entry.path === path)!;
      const middlewares = [...route.handler.middlewares!.beforeMiddlewares].map(
        (definition) => definition.middleware.constructor,
      );

      return getRouteErrors(Object.getPrototypeOf(route.handler.instance), route.handler.propertyName, {
        args: [],
        secured: false,
        middlewares,
      }).map((error) => error.status);
    };

    expect(errorsOf('/plain/inherit')).toEqual([429]);
    expect(errorsOf('/plain/off')).toEqual([]);
  });
});

describe('middleware slots without an app-wide entry', () => {
  it('should keep a route with only a skipped entry on the fast path', async () => {
    const app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(BareController);
      },
    });

    const route = app.container.get(Router).routes.find((entry) => entry.path === '/bare/off')!;

    expect(route.handler.simple).toBe(true);
    expect((await app.fetch(new globalThis.Request('http://localhost/bare/off'))).status).toBe(200);
  });
});

@Controller('/edges')
class EdgesController {
  // @Middleware() takes a slot and a skip too
  @Get('/decorator')
  @Middleware(LimitMiddleware, { slot: SLOT, args: { name: 'decorator' } })
  public decorator(): string {
    return 'ok';
  }

  @Get('/decorator-off')
  @Middleware(LimitMiddleware, { slot: SLOT, skip: true })
  public decoratorOff(): string {
    return 'ok';
  }

  // the same class in another slot, with the same args, is another middleware
  @Get('/two-slots')
  @Middleware(LimitMiddleware, { slot: 'other', args: { name: 'global' } })
  public twoSlots(): string {
    return 'ok';
  }

  // a skip without a slot never runs its middleware
  @Get('/stray-skip')
  @Middleware(TagMiddleware, { skip: true, args: { tag: 'stray' } })
  public straySkip(): string {
    return 'ok';
  }

  // lifting the slot leaves an unslotted entry of the same class alone
  @Get('/lifted-and-explicit')
  @Limit(false)
  @Middleware(LimitMiddleware, { args: { name: 'explicit' } })
  public liftedAndExplicit(): string {
    return 'ok';
  }
}

describe('middleware slots, edge cases', () => {
  let app: App;

  const limit = async (path: string): Promise<string | null> =>
    (await app.fetch(new globalThis.Request(`http://localhost${path}`))).headers.get('x-limit');

  beforeAll(async () => {
    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(LimitMiddleware, {
          slot: SLOT,
          args: { name: 'global' },
        });
        instance.container.bind(EdgesController);
      },
    });
  });

  it('should pass slot and skip given to @Middleware() on', async () => {
    expect(await limit('/edges/decorator')).toBe('decorator');
    expect(await limit('/edges/decorator-off')).toBeNull();
  });

  it('should run the same class once per slot, even with equal args', async () => {
    expect(await limit('/edges/two-slots')).toBe('global, global');
  });

  it('should never run an entry marked skip without a slot', async () => {
    const response = await app.fetch(new globalThis.Request('http://localhost/edges/stray-skip'));

    expect(response.headers.get('x-tag')).toBeNull();
  });

  it('should keep an unslotted entry next to a lifted slot of the same class', async () => {
    expect(await limit('/edges/lifted-and-explicit')).toBe('explicit');
  });
});
