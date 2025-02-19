import { Container } from '@vercube/di';
import { StorageManager, MemoryStorage } from '@vercube/storage';
import PlaygroundController from '../Controllers/PlaygroundController';
import { BasicAuthenticationProvider } from '../Services/BasicAuthenticationProvider';
import { Logger } from '@vercube/logger';
import { ConsoleAppender } from '@vercube/logger/appenders';

export function useContainer(container: Container): void {
  container.bind(BasicAuthenticationProvider);
  container.bind(PlaygroundController);

  container.bind(StorageManager);
  container.get(StorageManager).mount({ storage: MemoryStorage });

  container.get(Logger).configure({
    appenders: [
      { name: 'console', provider: ConsoleAppender },
    ],
  });
}
