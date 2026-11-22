import FooController from '@/controller/FooController';
import { Container } from '@vercube/di';
import { NetlifyContext } from '@vercube/serverless/netlify';

export function useContainer(container: Container): void {
  // the Netlify context of the request (geo, ip, deploy), injectable like any service
  container.bind(NetlifyContext);

  // register controllers
  container.bind(FooController);
}
