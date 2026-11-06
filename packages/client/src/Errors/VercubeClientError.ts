/**
 * Thrown for every response that is not 2xx.
 *
 * Vercube answers errors with a JSON body (`{ message, ... }`), which is parsed
 * into `body`; any other body is kept as text.
 */
export class VercubeClientError<B = unknown> extends Error {
  /** The HTTP status. */
  public readonly status: number;

  /** The parsed error body. */
  public readonly body: B;

  /** The response, its body already read. */
  public readonly response: Response;

  /**
   * @param response - The error response
   * @param body - Its parsed body
   */
  constructor(response: Response, body: B) {
    const message = (body as { message?: unknown } | null)?.message;

    super(typeof message === 'string' && message ? message : `${response.status} ${response.statusText}`.trim());
    this.name = 'VercubeClientError';
    this.status = response.status;
    this.body = body;
    this.response = response;
  }
}
