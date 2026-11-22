import { Controller, Get } from '@vercube/core';
import { getErrorGuidance } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { createTestApp, stub, TestingError, TestingErrors } from '../../src';
import { testTelemetry } from '../../src/Telemetry';

@Controller('/things')
class ThingController {
  @Get('/')
  public list(): string {
    return 'not json';
  }

  @Get('/html')
  public html(): Response {
    return new Response('<html>not json</html>', { headers: { 'content-type': 'text/html' } });
  }
}

/** Runs `fn` and returns what it threw. */
async function thrownBy(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }

  throw new Error('nothing was thrown');
}

describe('TestingErrors', () => {
  it('describes a member that was not stubbed', async () => {
    const repository = stub<{ save(): void }>({}, 'UserRepository');
    const error = await thrownBy(() => repository.save());

    expect(error).toBeInstanceOf(TestingError);
    expect((error as Error).name).toBe('TestingError');
    expect((error as Error).message).toBe(
      'UserRepository.save is not stubbed. Add it to the object passed to stub() or to the override.',
    );
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_TESTING_NOT_STUBBED');
  });

  it('describes an override after boot', async () => {
    await using app = await createTestApp({ controllers: [ThingController] });
    const error = await thrownBy(() => app.override());

    expect(error).toBeInstanceOf(TestingError);
    expect((error as Error).message).toBe(
      'Dependencies cannot be replaced once the app has booted: services already hold the original. Pass them in the `overrides` option of createTestApp() instead.',
    );
    expect(getErrorGuidance(error)).toMatchObject({
      code: 'VERCUBE_TESTING_OVERRIDE_AFTER_BOOT',
      fix: expect.stringContaining('createTestApp({ overrides'),
      link: 'https://vercube.dev/docs/core-features/errors#vercube_testing_override_after_boot',
    });
  });

  it('describes a request sent after close', async () => {
    const app = await createTestApp({ controllers: [ThingController] });

    await app.close();

    const error = await thrownBy(() => app.fetch('/things'));

    expect(error).toBeInstanceOf(TestingError);
    expect((error as Error).message).toBe('GET http://localhost/things was sent after app.close().');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_TESTING_APP_CLOSED');
    expect(getErrorGuidance(error)?.fix).toContain('createTestApp()');
  });

  it('describes telemetry that no app set up', async () => {
    const error = await thrownBy(() => testTelemetry().spans());

    expect(error).toBeInstanceOf(TestingError);
    expect((error as Error).message).toBe('testTelemetry() is not set up yet: pass it to createTestApp({ extensions }) first.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_TESTING_TELEMETRY_NOT_SET_UP');
  });

  it('keeps the phase and the cause of a failed boot', async () => {
    const cause = new Error('no database');
    const error = (await thrownBy(() =>
      createTestApp({
        setup: () => {
          throw cause;
        },
      }),
    )) as TestingError;

    expect(error).toBeInstanceOf(TestingError);
    expect(error.message).toBe('createTestApp() failed during setup in setup(): no database');
    expect(error.phase).toBe('setup');
    expect(error.cause).toBe(cause);
    expect(Object.keys(error)).toEqual(Object.keys(new TestingError('x', { phase: 'setup', cause })));
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_TESTING_BOOT_FAILED');
  });

  it('keeps the exchange of a failed expectation', async () => {
    await using app = await createTestApp({ controllers: [ThingController] });
    const error = (await thrownBy(() => app.get('/things').expect(201))) as TestingError;

    expect(error).toBeInstanceOf(TestingError);
    expect(error.message).toContain('Expected status 201, got 200');
    expect(error.request?.url).toBe('http://localhost/things');
    expect(error.response?.status).toBe(200);
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_TESTING_EXPECTATION_FAILED');
  });

  it('keeps the body of a response that is not JSON', async () => {
    await using app = await createTestApp({ controllers: [ThingController] });
    const response = await app.get('/things/html');
    const error = (await thrownBy(() => response.json())) as TestingError;

    expect(error).toBeInstanceOf(TestingError);
    expect(error.message).toBe(
      'Expected a JSON body from GET http://localhost/things/html, got text/html:\n<html>not json</html>',
    );
    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(error.response?.status).toBe(200);
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_TESTING_BODY_NOT_JSON');
  });

  it('keeps a failed close an AggregateError with every failure', async () => {
    const failure = new Error('socket still open');
    const app = await createTestApp({
      extensions: [
        {
          name: 'failing',
          teardown: () => {
            throw failure;
          },
        },
      ],
    });
    const error = (await thrownBy(() => app.close())) as AggregateError;

    expect(error.constructor).toBe(AggregateError);
    expect(error.message).toBe('Failed to close the test app');
    expect(error.errors).toEqual([failure]);
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_TESTING_CLOSE_FAILED');
  });

  it('builds its own errors as a TestingError', () => {
    expect(TestingErrors.LOGS_DISABLED()).toBeInstanceOf(TestingError);
    expect(TestingErrors.describe().every((entry) => entry.code.startsWith('VERCUBE_TESTING_'))).toBe(true);
  });
});
