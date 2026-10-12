import { describe, expect, it } from 'vitest';
import { Controller, createApp, Get, MetadataResolver } from '../../src';
import type { App, IntrospectionTypes } from '../../src';

@Controller('/declared')
class MountedController {
  @Get('/ping')
  public ping(): string {
    return 'pong';
  }
}

/**
 * Boots an application with the controller mounted under `path`.
 *
 * @param path - Where to mount it, or undefined for the declared path
 * @returns The application
 */
function boot(path?: string): Promise<App> {
  return createApp({
    configFile: false,
    cfg: { requestLogging: false },
    setup: async (app) => {
      if (path) {
        app.container.get(MetadataResolver).setControllerPath(MountedController, path);
      }

      app.container.bind(MountedController);
    },
  });
}

const status = async (app: App, path: string): Promise<number> =>
  (await app.fetch(new Request(`http://localhost${path}`))).status;

describe('MetadataResolver.setControllerPath', () => {
  it('should mount a controller elsewhere in one application only', async () => {
    const [first, second, declared] = await Promise.all([boot('/first'), boot('/second'), boot()]);

    expect(await status(first, '/first/ping')).toBe(200);
    expect(await status(first, '/second/ping')).toBe(404);
    expect(await status(first, '/declared/ping')).toBe(404);
    expect(await status(second, '/second/ping')).toBe(200);
    expect(await status(declared, '/declared/ping')).toBe(200);
  });

  it('should describe the path the controller is mounted under', async () => {
    const app = await boot('/mounted');

    const section = (await app.inspect('routes')) as { data: IntrospectionTypes.RouteDescription[] };
    const ping = section.data.find((route) => route.path === '/mounted/ping');

    expect(ping?.basePath).toBe('/mounted');
    expect(app.container.get(MetadataResolver).getControllerPath(MountedController)).toBe('/mounted');
  });

  it('should keep the path an application mounts a controller under out of the shared metadata', async () => {
    await Promise.all([boot('/first'), boot('/second')]);

    const metadata = (MountedController.prototype as unknown as { __metadata: { __methods: Record<string, { url: string }> } })
      .__metadata;

    expect(metadata.__methods.ping.url).toBe('/declared/ping');
  });
});
