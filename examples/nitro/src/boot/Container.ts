import FooController from '@/controller/FooController';
import { Container } from '@vercube/di';

export function useContainer(container: Container): void {
  // register controllers
  container.bind(FooController);
}
