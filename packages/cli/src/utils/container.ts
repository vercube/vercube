import { ErrorHandlerProvider } from '@vercube/core';
import { Logger } from '@vercube/logger';
import type { Container } from '@vercube/di';

export function bindMockContainer(container: Container) {
  container.bindMock(Logger, {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  });

  container.bindMock(ErrorHandlerProvider, {
    handleError: () => {
      return new Response('Error');
    },
  });
}
