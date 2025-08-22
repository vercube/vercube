import { CustomErrorHandler } from 'src/Error/CustomErrorHandler';
import { ErrorHandlerProvider } from '@vercube/core';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { ConsoleProvider } from '@vercube/logger/drivers/ConsoleProvider';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import PlaygroundController from '../Controllers/PlaygroundController';
import { BasicAuthenticationProvider } from '../Services/BasicAuthenticationProvider';
import { DummyAuthorizationProvider } from '../Services/DummyAuthorizationProvider';

export function useContainer(container: Container): void {
  container.bind(BasicAuthenticationProvider);
  container.bind(DummyAuthorizationProvider);
  container.bind(PlaygroundController);

  container.bind(StorageManager);
  container.get(StorageManager).mount({ storage: MemoryStorage });

  container.bind(ErrorHandlerProvider, CustomErrorHandler);

  container.get(Logger).configure({
    providers: [{ name: 'console', provider: ConsoleProvider, logLevel: 'error' }],
  });
}
