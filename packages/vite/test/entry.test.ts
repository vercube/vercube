import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'pathe';
import { describe, expect, it } from 'vitest';
import { generateServerEntry, writeServerEntry } from '../src/entry';
import type { VercubePluginContext } from '../src/types';
import type { ServiceInfo } from '@vercube/scan';

function cls(className: string, isDefault = false): ServiceInfo {
  const path = `/abs/${className}.ts`;
  return {
    importClassName: className,
    import: isDefault ? `import ${className} from '${path}';` : `import { ${className} } from '${path}';`,
    fullPath: path,
    path: `${className}.ts`,
  };
}

function ctx(overrides: Partial<VercubePluginContext>): VercubePluginContext {
  return {
    pluginConfig: {},
    root: '/abs',
    scanDirs: ['/abs/src'],
    serverEntry: '/abs/node_modules/.vercube/server-entry.mjs',
    dev: true,
    hasClient: false,
    controllers: [],
    routes: [],
    services: [],
    ...overrides,
  };
}

describe('generateServerEntry', () => {
  it('imports core, binds discovered classes, flushes and exports fetch + handleUpgrade', () => {
    const code = generateServerEntry(ctx({ controllers: [cls('UserController', true)], services: [cls('MailService')] }));

    expect(code).toContain(`import { createApp } from '@vercube/core';`);
    expect(code).toContain(`import UserController from '/abs/UserController.ts';`);
    expect(code).toContain(`import { MailService } from '/abs/MailService.ts';`);
    expect(code).toContain('const app = await createApp();');
    expect(code).toContain('app.container.bind(UserController);');
    expect(code).toContain('app.container.bind(MailService);');
    expect(code).toContain('app.container.flushQueue();');
    expect(code).toContain('export const fetch = app.fetch.bind(app);');
    expect(code).toContain('export const handleUpgrade =');
  });

  it('deduplicates imports and binds for a class discovered more than once', () => {
    const code = generateServerEntry(ctx({ controllers: [cls('UserController', true), cls('UserController', true)] }));

    expect(code.match(/import UserController from/g)).toHaveLength(1);
    expect(code.match(/app\.container\.bind\(UserController\)/g)).toHaveLength(1);
  });

  it('runs the setup file inside createApp as a pre-init setup hook', () => {
    const code = generateServerEntry(ctx({ setupFile: '/abs/setup.ts', controllers: [cls('UserController')] }));

    expect(code).toContain(`import __vercubeSetup__ from "/abs/setup.ts";`);
    expect(code).toContain('const app = await createApp({ setup: async (app) => {');
    expect(code).toContain('await __vercubeSetup__(app);');
    // setup is wired into createApp (pre-init), binds happen afterwards
    expect(code.indexOf('await __vercubeSetup__(app);')).toBeLessThan(code.indexOf('app.container.bind(UserController);'));
  });

  it('produces a valid empty app when nothing is discovered', () => {
    const code = generateServerEntry(ctx({}));
    expect(code).toContain('const app = await createApp();');
    expect(code).toContain('export const fetch = app.fetch.bind(app);');
    expect(code).not.toContain('app.container.bind(');
  });

  it('serves the built frontend in production when the project has a client', () => {
    const code = generateServerEntry(ctx({ hasClient: true, controllers: [cls('HelloController', true)] }));

    expect(code).toContain(`import { createApp, HttpServer, serveStaticFiles } from '@vercube/core';`);
    // static is only registered when run directly (production)
    expect(code).toContain('if (import.meta.main) {');
    expect(code).toContain('httpServer.addPlugin(serveStaticFiles(dir));');
    expect(code).toContain('httpServer.enableSpaFallback(dir);');
    expect(code).toContain("new URL('./public', import.meta.url)");
  });

  it('does not pull in the static server when there is no client', () => {
    const code = generateServerEntry(ctx({ hasClient: false, controllers: [cls('HelloController', true)] }));

    expect(code).toContain(`import { createApp } from '@vercube/core';`);
    expect(code).not.toContain('serveStaticFiles');
    expect(code).not.toContain('HttpServer');
  });
});

describe('writeServerEntry', () => {
  it('writes the generated entry to disk', () => {
    const serverEntry = `/tmp/vercube-entry-${Date.now()}/node_modules/.vercube/server-entry.mjs`;
    const context = ctx({ serverEntry, controllers: [cls('HelloController', true)] });

    try {
      writeServerEntry(context);
      expect(existsSync(serverEntry)).toBe(true);
      expect(readFileSync(serverEntry, 'utf8')).toBe(generateServerEntry(context));
    } finally {
      rmSync(dirname(dirname(serverEntry)), { recursive: true, force: true });
    }
  });
});
