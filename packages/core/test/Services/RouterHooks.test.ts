import { describe, expect, it } from 'vitest';
import { Controller, createApp, Get, HooksService, Router, RouterAfterInitHook, RouterBeforeInitHook } from '../../src';

@Controller('/hooks')
class HooksController {
  @Get('/a')
  public a() {
    return {};
  }

  @Get('/b')
  public b() {
    return {};
  }
}

describe('router hooks', () => {
  it('should fire RouterAfterInitHook once the routes are registered', async () => {
    let seen = -1;

    await createApp({
      cfg: { requestLogging: false },
      setup: (app) => {
        app.container.bind(HooksController);
        app.container.get(HooksService).on(RouterAfterInitHook, () => {
          // GET and HEAD for each route
          seen = app.container.get(Router).routes.length;
        });
      },
    });

    expect(seen).toBe(4);
  });

  it('should fail the boot when a router hook listener fails', async () => {
    await expect(
      createApp({
        cfg: { requestLogging: false },
        setup: (app) => {
          app.container.get(HooksService).on(RouterBeforeInitHook, async () => {
            throw new Error('listener failed');
          });
        },
      }),
    ).rejects.toThrow('listener failed');
  });
});
