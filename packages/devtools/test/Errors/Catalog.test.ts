import { NotFoundError } from '@vercube/core';
import { getErrorGuidance } from '@vercube/di';
import { afterEach, describe, expect, it } from 'vitest';
import { DevtoolsController } from '../../src/Controllers/DevtoolsController';
import { resetDevtoolsTelemetry } from '../../src/Telemetry/DevtoolsTelemetry';
import { createDevtoolsApp, devtoolsFetch } from '../Utils/App';

describe('DevtoolsErrors', () => {
  afterEach(() => {
    resetDevtoolsTelemetry();
  });

  it('describes an unknown introspection section', async () => {
    const app = await createDevtoolsApp();
    const controller = app.container.get(DevtoolsController);
    const error = await controller.section('nope').catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).message).toBe('Unknown introspection section: nope');
    expect((error as NotFoundError).status).toBe(404);
    expect(JSON.stringify(error)).toBe(JSON.stringify(new NotFoundError('Unknown introspection section: nope')));
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_DEVTOOLS_UNKNOWN_SECTION');

    await app.close();
  });

  it('describes an unknown signal', async () => {
    const app = await createDevtoolsApp();
    const controller = app.container.get(DevtoolsController);
    const error = await Promise.resolve()
      .then(() => controller.signals('nope'))
      .catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).message).toBe('Unknown signal: nope');
    expect(getErrorGuidance(error)).toMatchObject({
      code: 'VERCUBE_DEVTOOLS_UNKNOWN_SIGNAL',
      fix: expect.stringContaining('`traces`, `metrics` or `logs`'),
    });

    await app.close();
  });

  it('still answers with a 404', async () => {
    const app = await createDevtoolsApp();
    const response = await devtoolsFetch(app, '/_devtools/api/signals/nope');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: 404, message: 'Unknown signal: nope' });

    await app.close();
  });
});
