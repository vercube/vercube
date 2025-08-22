import { HttpError } from '../HttpError';

/**
 * Represents a Not Found error (HTTP 404).
 * @extends {HttpError}
 */
export class NotFoundError extends HttpError {
  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'NotFoundError';

  /**
   * Creates an instance of NotFoundError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(404);
    Object.setPrototypeOf(this, NotFoundError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
