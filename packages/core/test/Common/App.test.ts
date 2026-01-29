import { Container } from '@vercube/di';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type App } from '../../src';
import { HttpServer } from '../../src/Services/HttpServer/HttpServer';
import { PluginsRegistry } from '../../src/Services/Plugins/PluginsRegistry';
import { Router } from '../../src/Services/Router/Router';
import { StaticRequestHandler } from '../../src/Services/Router/StaticRequestHandler';
import { createTestApp } from '../Utils/App.mock';
import { MockPlugin } from '../Utils/Plugin.mock';
import type { ConfigTypes } from '../../src/Types/ConfigTypes';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    serve: vi.fn(),
    ready: vi.fn().mockResolvedValue(undefined),
  }),
  FastResponse: vi.fn(),
}));

describe('App', () => {
  let app: App;
  let container: Container;
  const config: ConfigTypes.Config = {
    logLevel: 'debug',
    server: {
      static: {
        dirs: ['./public'],
        maxAge: 3600,
        immutable: true,
        etag: true,
      },
    },
    runtime: {
      test: 'test',
    },
  };

  beforeEach(async () => {
    app = await createTestApp({ cfg: config });
    container = app.container;
  });

  describe('initialization', () => {
    it('should initialize with provided config', async () => {
      const httpServer = container.get(HttpServer);
      const router = container.get(Router);
      const staticHandler = container.get(StaticRequestHandler);

      vi.spyOn(httpServer, 'initialize');
      vi.spyOn(router, 'initialize');
      vi.spyOn(staticHandler, 'initialize');

      await app.init(config);

      expect(httpServer.initialize).toHaveBeenCalledWith(config);
      expect(router.initialize).toHaveBeenCalled();
      expect(staticHandler.initialize).toHaveBeenCalledWith(config.server?.static);
    });

    it('should listen for incoming requests', async () => {
      const httpServer = container.get(HttpServer);

      vi.spyOn(httpServer, 'listen');

      await app.listen();
      expect(httpServer.listen).toHaveBeenCalled();
    });

    it('should throw an error if the app is already initialized', async () => {
      await app.listen();

      await expect(app.listen()).rejects.toThrow('App is already initialized');
    });

    describe('VERCUBE_CLI_MODE', () => {
      let originalEnv: string | undefined;

      beforeEach(() => {
        originalEnv = process.env.VERCUBE_CLI_MODE;
      });

      afterEach(() => {
        if (originalEnv === undefined) {
          delete process.env.VERCUBE_CLI_MODE;
        } else {
          process.env.VERCUBE_CLI_MODE = originalEnv;
        }
      });

      it('should skip httpServer.listen() when VERCUBE_CLI_MODE is true', async () => {
        process.env.VERCUBE_CLI_MODE = 'true';

        const freshApp = await createTestApp({ cfg: config });
        const httpServer = freshApp.container.get(HttpServer);
        const listenSpy = vi.spyOn(httpServer, 'listen');

        await freshApp.listen();

        expect(listenSpy).not.toHaveBeenCalled();
      });

      it('should call httpServer.listen() when VERCUBE_CLI_MODE is not set', async () => {
        delete process.env.VERCUBE_CLI_MODE;

        const freshApp = await createTestApp({ cfg: config });
        const httpServer = freshApp.container.get(HttpServer);
        const listenSpy = vi.spyOn(httpServer, 'listen');

        await freshApp.listen();

        expect(listenSpy).toHaveBeenCalled();
      });

      it('should call httpServer.listen() when VERCUBE_CLI_MODE is not "true"', async () => {
        process.env.VERCUBE_CLI_MODE = 'false';

        const freshApp = await createTestApp({ cfg: config });
        const httpServer = freshApp.container.get(HttpServer);
        const listenSpy = vi.spyOn(httpServer, 'listen');

        await freshApp.listen();

        expect(listenSpy).toHaveBeenCalled();
      });
    });
  });

  describe('fetch', () => {
    it('should fetch a request', async () => {
      const request = new Request('http://localhost/mock/get');
      const spyHttpServer = vi.spyOn(container.get(HttpServer), 'handleRequest');

      await app.fetch(request);

      expect(spyHttpServer).toHaveBeenCalledWith(request);
    });
  });

  describe('config', () => {
    it('should return config without runtime', () => {
      expect(app.config.runtime).toBeUndefined();
    });
  });

  describe('plugins', () => {
    it('should add plugin', () => {
      const spyOnPluginsRegistry = vi.spyOn(container.get(PluginsRegistry), 'register');
      app.addPlugin(MockPlugin);

      expect(spyOnPluginsRegistry).toHaveBeenCalledWith(MockPlugin, undefined);
    });
  });
});
