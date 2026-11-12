import { HttpError } from '../HttpError';

/**
 * Represents a Too Many Requests error (HTTP 429).
 * @extends {HttpError}
 */
export class TooManyRequestsError extends HttpError {
  /**
   * The HTTP status code every instance answers with, readable without
   * creating one (`@Throws` and the client typegen read it).
   */
  public static readonly status: number = 429;

  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'TooManyRequestsError';

  /**
   * Creates an instance of TooManyRequestsError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(429);
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
