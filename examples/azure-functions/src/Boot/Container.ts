import { Container } from '@vercube/di';
import PlaygroundController from '@/Controllers/PlaygroundController';

export function useContainer(container: Container): void {
  container.bind(PlaygroundController);
}
