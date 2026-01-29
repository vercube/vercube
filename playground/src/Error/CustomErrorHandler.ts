import { ErrorHandlerProvider } from '@vercube/core';

export class CustomErrorHandler extends ErrorHandlerProvider {
  public async handleError(error: Error): Promise<Response> {
    return new Response('Custom error handler');
  }
}
