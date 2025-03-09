import { Inject } from '@vercube/di';
import { serve, type Server} from 'srvx';
import { Router } from '../Router/Router';
import { RequestHandler } from '../Router/RequestHandler';

export class HttpServer {

  @Inject(Router)
  private gRouter: Router;

  @Inject(RequestHandler)
  private gRequestHandler: RequestHandler;

  private fServer: Server;

  public async initialize(): Promise<void> {

    this.fServer = serve({
      port: 3000,
      fetch: this.handleRequest.bind(this),
    });

    await this.fServer.ready();
  }

  private async handleRequest(request: Request): Promise<Response> {
    const route = this.gRouter.resolve({ path: request.url, method: request.method });

    if (!route) {
      return new Response(JSON.stringify({ message: 'Route not found', statusCode: 404 }, null, 2), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return this.gRequestHandler.handleRequest(request, route);
  }

}