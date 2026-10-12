import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { TestLogger } from '../Services/TestLogger';
import { applyOverrides, bindProviders } from '../Utils/Bindings';
import type { TestingTypes } from '../Types/TestingTypes';

/**
 * Builds a bare container for unit tests of services, without an application
 * or HTTP. `@Init()` hooks run, as they would in an application.
 *
 * @param options - What to bind
 * @returns The container, and the test logger when one was bound
 *
 * @example
 * ```ts
 * const { container, logs } = createTestContainer({
 *   providers: [PriceService],
 *   overrides: [[ExchangeRates, { rate: () => 4.3 }]],
 * });
 *
 * container.get(PriceService).toPln(10); // 43
 * ```
 */
export function createTestContainer(options: TestingTypes.TestContainerOptions = {}): {
  container: Container;
  logs: TestLogger | null;
} {
  const container = new Container();
  const logs = options.logger === false ? null : new TestLogger();

  if (logs) {
    container.bindInstance(Logger, logs);
  }

  bindProviders(container, options.providers);
  applyOverrides(container, options.overrides, options.strictOverrides);

  initializeContainer(container);

  return { container, logs };
}
