import { HttpError } from '../HttpError';

/**
 * Represents an Unauthorized error (HTTP 401).
 * @extends {HttpError}
 */
export class UnauthorizedError extends HttpError {

  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'UnauthorizedError';

  /**
   * Creates an instance of UnauthorizedError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(401);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);

    if (message) {
      this.message = message;
    }

  }

}