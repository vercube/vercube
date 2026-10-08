import { AuthProvider } from '@vercube/auth';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { EmailConsumer } from '../Consumers/EmailConsumer';
import { EventsController } from '../Controllers/EventsController';
import PlaygroundController from '../Controllers/PlaygroundController';
import { QueueController } from '../Controllers/QueueController';
import { RequestContextController } from '../Controllers/RequestContextController';
import { BasicAuthenticationProvider } from '../Services/BasicAuthenticationProvider';
import { EventsService } from '../Services/EventsService';
import { TypedRequestContext } from '../Services/TypedRequestContext';

export function useContainer(container: Container): void {
  container.bind(AuthProvider, BasicAuthenticationProvider);
  container.bind(BasicAuthenticationProvider);
  container.bind(PlaygroundController);
  container.bind(RequestContextController);
  container.bind(QueueController);
  container.bind(EventsController);
  container.bind(EventsService);
  container.bind(EmailConsumer);
  container.bindTransient(TypedRequestContext);

  container.bind(StorageManager);
  container.get(StorageManager).mount({ storage: MemoryStorage });

  container.get(Logger).configure({
    logLevel: 'info',
  });
}
