import { HttpError } from '../HttpError';

/**
 * Represents an Internal Server error (HTTP 500).
 * @extends {HttpError}
 */
export class InternalServerError extends HttpError {
  /**
   * The HTTP status code every instance answers with, readable without
   * creating one (`@Throws` and the client typegen read it).
   */
  public static readonly status: number = 500;

  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'InternalServerError';

  /**
   * Creates an instance of InternalServerError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(500);
    Object.setPrototypeOf(this, InternalServerError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
