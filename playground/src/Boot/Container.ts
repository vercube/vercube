import { Container } from '@vercube/di';
import { StorageManager, MemoryStorage } from '@vercube/storage';
import PlaygroundController from '../Controllers/PlaygroundController';
import { BasicAuthenticationProvider } from '../Services/BasicAuthenticationProvider';
import { Logger } from '@vercube/logger';
import { SignaleProvider, ConsoleProvider } from '@vercube/logger';
import { DummyAuthorizationProvider } from '../Services/DummyAuthorizationProvider';

export function useContainer(container: Container): void {
  container.bind(BasicAuthenticationProvider);
  container.bind(DummyAuthorizationProvider);
  container.bind(PlaygroundController);

  container.bind(StorageManager);
  container.get(StorageManager).mount({ storage: MemoryStorage });

  container.get(Logger).configure({
    providers: [
      { name: 'console', provider: ConsoleProvider, logLevel: 'error' },
    ],
  });
}
