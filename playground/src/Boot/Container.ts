import { Container } from '@vercube/di';
import { StorageManager, MemoryStorage } from '@vercube/storage';
import PlaygroundController from '../Controllers/PlaygroundController';

export function useContainer(container: Container): void {
  container.bind(PlaygroundController);
  container.bind(StorageManager);

  container.get(StorageManager).mount({ storage: MemoryStorage });
};