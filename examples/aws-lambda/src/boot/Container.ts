import { Container } from '@vercube/di';
import FooController from '@/controller/FooController';

export function useContainer(container: Container): void {
  // register controllers
  container.bind(FooController);
}
