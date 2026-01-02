import { AuthProvider } from '@vercube/auth';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { ConsoleProvider } from '@vercube/logger/drivers/ConsoleProvider';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { WeatherTool } from 'src/Tools/WeatherTool';
import PlaygroundController from '../Controllers/PlaygroundController';
import { RequestContextController } from '../Controllers/RequestContextController';
import { BasicAuthenticationProvider } from '../Services/BasicAuthenticationProvider';

export function useContainer(container: Container): void {
  container.bind(AuthProvider, BasicAuthenticationProvider);
  container.bind(PlaygroundController);
  container.bind(RequestContextController);

  container.bind(StorageManager);
  container.get(StorageManager).mount({ storage: MemoryStorage });

  container.bind(WeatherTool);

  container.get(Logger).configure({
    providers: [{ name: 'console', provider: ConsoleProvider, logLevel: 'error' }],
  });
}
