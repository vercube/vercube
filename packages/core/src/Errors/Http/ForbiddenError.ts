import { HttpError } from '../HttpError';

/**
 * Represents a Forbidden error (HTTP 403).
 * @extends {HttpError}
 */
export class ForbiddenError extends HttpError {
  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'ForbiddenError';

  /**
   * Creates an instance of ForbiddenError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(403);
    Object.setPrototypeOf(this, ForbiddenError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
