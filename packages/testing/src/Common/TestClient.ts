import { TestRequest } from '../Request/TestRequest';
import type { CookieJar } from '../Request/CookieJar';
import type { RequestTarget } from '../Request/TestRequest';

/**
 * The request builders shared by `TestApp` and its agents.
 */
export abstract class TestClient implements RequestTarget {
  /** @inheritdoc */
  public abstract readonly baseUrl: string;

  /** @inheritdoc */
  public abstract readonly jar: CookieJar | null;

  /** @inheritdoc */
  public abstract dispatch(request: Request): Promise<Response>;

  /** @inheritdoc */
  public abstract impersonate(request: Request, user: unknown): Request;

  /**
   * Starts a request with any method.
   *
   * @param method - HTTP method
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public request(method: string, path: string): TestRequest {
    return new TestRequest(this, method, path);
  }

  /**
   * Starts a GET request.
   *
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public get(path: string): TestRequest {
    return this.request('GET', path);
  }

  /**
   * Starts a POST request.
   *
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public post(path: string): TestRequest {
    return this.request('POST', path);
  }

  /**
   * Starts a PUT request.
   *
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public put(path: string): TestRequest {
    return this.request('PUT', path);
  }

  /**
   * Starts a PATCH request.
   *
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public patch(path: string): TestRequest {
    return this.request('PATCH', path);
  }

  /**
   * Starts a DELETE request.
   *
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public delete(path: string): TestRequest {
    return this.request('DELETE', path);
  }

  /**
   * Starts a HEAD request.
   *
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public head(path: string): TestRequest {
    return this.request('HEAD', path);
  }

  /**
   * Starts an OPTIONS request.
   *
   * @param path - A path relative to the base URL, or an absolute URL
   * @returns The request builder
   */
  public options(path: string): TestRequest {
    return this.request('OPTIONS', path);
  }
}
