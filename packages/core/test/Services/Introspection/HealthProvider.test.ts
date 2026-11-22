import { describe, expect, it } from 'vitest';
import { createApp, IntrospectionRegistry } from '../../../src';
import type { App, ConfigTypes, HealthTypes } from '../../../src';

async function createHealthApp(cfg: ConfigTypes.Config = {}): Promise<App> {
  return createApp({ cfg: { requestLogging: false, ...cfg }, configFile: false });
}

async function describeHealth(app: App): Promise<HealthTypes.Description> {
  return (await app.container.get(IntrospectionRegistry).describe<HealthTypes.Description>('health'))!.data;
}

describe('HealthProvider', () => {
  it('is registered as the health section', async () => {
    const app = await createHealthApp();

    expect(
      app.container
        .get(IntrospectionRegistry)
        .list()
        .map((section) => section.id),
    ).toContain('health');
  });

  it('describes an application without health routes', async () => {
    const app = await createHealthApp();

    expect(await describeHealth(app)).toEqual({
      state: 'starting',
      checks: [],
      report: null,
      config: {
        routes: false,
        endpoints: { live: null, ready: null, startup: null },
        details: 'summary',
        token: false,
        timeout: 1000,
        cacheTtl: 1000,
        telemetry: false,
        drainDelay: 0,
        handleSignals: false,
      },
    });
  });

  it('describes the settings health brings, without the token', async () => {
    const app = await createHealthApp({
      health: { path: '/internal', endpoints: { startup: false }, token: 'hunter2', details: 'none', timeout: 300 },
    });
    const health = await describeHealth(app);

    expect(health.config).toMatchObject({
      routes: true,
      endpoints: { live: '/internal/live', ready: '/internal/ready', startup: null },
      details: 'none',
      token: true,
      timeout: 300,
      drainDelay: 5000,
      handleSignals: true,
    });
    expect(JSON.stringify(health)).not.toContain('hunter2');
  });

  it('lists checks without running them and shows the last report once they ran', async () => {
    const app = await createHealthApp();
    let runs = 0;

    app.health.register({ name: 'storage:uploads', critical: false, check: () => void runs++ });

    const before = await describeHealth(app);

    expect(before.checks).toEqual([{ name: 'storage:uploads', critical: false, timeout: 1000 }]);
    expect(before.report).toBeNull();
    expect(runs).toBe(0);

    await app.health.check();

    const after = await describeHealth(app);

    expect(after.report?.status).toBe('ok');
    expect(after.report?.checks['storage:uploads']).toMatchObject({ status: 'ok', critical: false });
    expect(runs).toBe(1);
  });

  it('changes its revision with a report and announces a state change', async () => {
    const app = await createHealthApp();
    const registry = app.container.get(IntrospectionRegistry);
    const revision = (): number => registry.list().find((section) => section.id === 'health')!.revision;
    const announced: string[] = [];

    registry.onInvalidate((id) => announced.push(id));
    app.health.register({ name: 'db', check: () => {} });

    const registered = revision();

    await app.health.check();

    const reported = revision();

    expect(reported).not.toBe(registered);

    await app.start();

    expect(revision()).not.toBe(reported);
    expect(announced).toContain('health');
    expect((await describeHealth(app)).state).toBe('ready');

    await app.close();

    expect((await describeHealth(app)).state).toBe('closed');
  });
});
