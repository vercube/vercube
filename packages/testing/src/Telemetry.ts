import { TelemetryPlugin } from '@vercube/telemetry';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { TestingError } from './Errors/TestingError';
import type { TestingTypes } from './Types/TestingTypes';
import type { TestTelemetry } from '@vercube/telemetry/testing';

/**
 * The extension {@link testTelemetry} returns: the in-memory telemetry of
 * `@vercube/telemetry/testing`, available once the app has booted.
 */
export interface TestTelemetryExtension
  extends TestingTypes.Extension, Pick<TestTelemetry, 'spans' | 'span' | 'reset' | 'settle' | 'collect'> {
  /** The underlying telemetry handle, for its providers and exporter. */
  readonly telemetry: TestTelemetry;
}

/**
 * Records the application's spans and metrics in memory. Registers an
 * in-memory tracer and meter provider, installs `TelemetryPlugin`, and shuts
 * the providers down on `close()`.
 *
 * The providers are process-wide, so apps using this extension should not run
 * in parallel within one test file.
 *
 * @returns The extension, with the spans and metrics it recorded
 *
 * @example
 * ```ts
 * const telemetry = testTelemetry();
 * const app = await createTestApp({ controllers: [UserController], extensions: [telemetry] });
 *
 * await app.get('/users/1');
 * await telemetry.settle();
 *
 * expect(telemetry.span('GET /users/:id')).toBeDefined();
 * ```
 */
export function testTelemetry(): TestTelemetryExtension {
  let current: TestTelemetry | null = null;

  const handle = (): TestTelemetry => {
    if (!current) {
      throw new TestingError('testTelemetry() is not set up yet: pass it to createTestApp({ extensions }) first.');
    }

    return current;
  };

  return {
    name: 'testTelemetry',
    get telemetry() {
      return handle();
    },
    setup: (app) => {
      current = createTestTelemetry();
      app.addPlugin(TelemetryPlugin, { enabled: true });
    },
    teardown: async () => {
      await current?.shutdown();
    },
    spans: () => handle().spans(),
    span: (name) => handle().span(name),
    reset: () => handle().reset(),
    settle: () => handle().settle(),
    collect: () => handle().collect(),
  };
}
