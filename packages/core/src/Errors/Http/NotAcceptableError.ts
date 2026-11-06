import { HttpError } from '../HttpError';

/**
 * Represents a Not Acceptable error (HTTP 406).
 * @extends {HttpError}
 */
export class NotAcceptableError extends HttpError {
  /**
   * The HTTP status code every instance answers with, readable without
   * creating one (`@Throws` and the client typegen read it).
   */
  public static readonly status: number = 406;

  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'NotAcceptableError';

  /**
   * Creates an instance of NotAcceptableError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(406);
    Object.setPrototypeOf(this, NotAcceptableError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
