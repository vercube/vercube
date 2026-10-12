import { vercubePluginFromClass } from '@vercube/core';
import { createTestApp } from '@vercube/testing';
import { describe, it } from 'vitest';
import { DevtoolsPlugin } from '../src/Plugins/DevtoolsPlugin';
import type { TestApp } from '@vercube/testing';

/**
 * Boots an application with devtools mounted under `path`.
 *
 * @param path - Mount path
 * @returns The running application
 */
function boot(path: string): Promise<TestApp> {
  return createTestApp({
    config: { plugins: [vercubePluginFromClass(DevtoolsPlugin, { enabled: true, path })] },
  });
}

describe('[devtools] two apps in one process', () => {
  it('should serve each app under its own path when booted one after the other', async () => {
    const first = await boot('/_first');
    const second = await boot('/_second');

    await first.get('/_first/api/introspect').expect(200);
    await second.get('/_second/api/introspect').expect(200);
    await first.get('/_second/api/introspect').expect(404);
    await second.get('/_first/api/introspect').expect(404);

    await Promise.all([first.close(), second.close()]);
  });

  it('should serve each app under its own path when booted together', async () => {
    const [first, second] = await Promise.all([boot('/_one'), boot('/_two')]);

    await first.get('/_one/api/introspect').expect(200);
    await second.get('/_two/api/introspect').expect(200);
    await first.get('/_two/api/introspect').expect(404);
    await second.get('/_one/api/introspect').expect(404);

    await Promise.all([first.close(), second.close()]);
  });
});
