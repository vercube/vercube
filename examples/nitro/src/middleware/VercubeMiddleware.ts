import { BaseMiddleware } from '@vercube/core';

export class VercubeMiddleware extends BaseMiddleware {
  public async onRequest(): Promise<void> {
    console.log('VercubeMiddleware::onRequest');
  }
}
