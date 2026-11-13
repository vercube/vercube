import { HttpError } from '../HttpError';

/**
 * Represents a Service Unavailable error (HTTP 503).
 * @extends {HttpError}
 */
export class ServiceUnavailableError extends HttpError {
  /**
   * The HTTP status code every instance answers with, readable without
   * creating one (`@Throws` and the client typegen read it).
   */
  public static readonly status: number = 503;

  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'ServiceUnavailableError';

  /**
   * Creates an instance of ServiceUnavailableError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(503);
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
