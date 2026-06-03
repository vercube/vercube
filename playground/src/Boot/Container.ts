import { AuthProvider } from '@vercube/auth';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import PlaygroundController from '../Controllers/PlaygroundController';
import { RequestContextController } from '../Controllers/RequestContextController';
import { BasicAuthenticationProvider } from '../Services/BasicAuthenticationProvider';
import { TypedRequestContext } from '../Services/TypedRequestContext';

export function useContainer(container: Container): void {
  container.bind(AuthProvider, BasicAuthenticationProvider);
  container.bind(PlaygroundController);
  container.bind(RequestContextController);
  container.bindTransient(TypedRequestContext);

  container.bind(StorageManager);
  container.get(StorageManager).mount({ storage: MemoryStorage });

  container.get(Logger).configure({
    logLevel: 'error',
  });
}
