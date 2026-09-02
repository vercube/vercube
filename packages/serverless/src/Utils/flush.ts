import { TelemetryRegistry } from '@vercube/core';
import type { App } from '@vercube/core';

/**
 * Pushes out buffered telemetry before an invocation returns.
 *
 * A serverless platform is free to freeze the process the instant a response is
 * handed back, which is exactly when a batching span exporter still has the
 * request's spans in memory. Flushing here is the difference between a traced
 * function and one that only reports the invocations that happened to be
 * followed by another.
 *
 * Costs nothing when no telemetry is installed.
 *
 * @param app - The running application
 * @returns Resolves once the buffers are empty
 */
export async function flushTelemetry(app: App): Promise<void> {
  const hooks = app.container.getOptional(TelemetryRegistry)?.hooks;

  if (!hooks) {
    return;
  }

  // An exporter that cannot reach its collector must not fail the invocation.
  await hooks.flush().catch(() => {});
}
