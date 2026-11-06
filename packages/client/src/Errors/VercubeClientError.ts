/**
 * Thrown for every response that is not 2xx.
 *
 * Vercube answers errors with a JSON body (`{ status, name, message, ... }`),
 * which is parsed into `body`; any other body is kept as text.
 *
 * `B` is the body and `S` the status. For a route that declares its errors
 * with `@Throws()`, `api.safe` and `api.isRouteError()` type it as a union with
 * one member per declared error, which `switch (error.status)` tells apart.
 */
export class VercubeClientError<B = unknown, S extends number = number> extends Error {
  /** The HTTP status. */
  public readonly status: S;

  /** The parsed error body. */
  public readonly body: B;

  /** The response, its body already read. */
  public readonly response: Response;

  /** The route called, as in the route map (`'GET /users/:id'`), when the client made the call. */
  public readonly route: string | undefined;

  /**
   * @param response - The error response
   * @param body - Its parsed body
   * @param route - The route called, `'METHOD /path/:template'`
   */
  constructor(response: Response, body: B, route?: string) {
    const message = (body as { message?: unknown } | null)?.message;

    super(typeof message === 'string' && message ? message : `${response.status} ${response.statusText}`.trim());
    this.name = 'VercubeClientError';
    this.status = response.status as S;
    this.body = body;
    this.response = response;
    this.route = route;
  }
}
