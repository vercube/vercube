import { ErrorHandlerProvider } from '@vercube/core';

export class CustomErrorHandler extends ErrorHandlerProvider {

  public async handleError(error: Error): Promise<Response> {
    console.log('CustomErrorHandler::handleError', error);
    return new Response('Custom error handler');
  }

}