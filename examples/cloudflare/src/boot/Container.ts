import FooController from '@/controller/FooController';
import { Container } from '@vercube/di';
import { CloudflareBindings } from '@vercube/serverless/cloudflare';

export function useContainer(container: Container): void {
  // the bindings of the request (KV, R2, D1, variables), injectable like any service
  container.bind(CloudflareBindings);

  // register controllers
  container.bind(FooController);
}
