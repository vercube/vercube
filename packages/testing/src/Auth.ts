import { AuthProvider } from '@vercube/auth';
import type { TestApp } from './Common/TestApp';
import type { TestingTypes } from './Types/TestingTypes';
import type { AuthTypes } from '@vercube/auth';

/**
 * Options for {@link testAuth}.
 */
export interface TestAuthOptions<U = any> {
  /**
   * Reads the roles of a user, checked against the roles `@Auth({ roles })`
   * requires. Defaults to `user.roles`, or none.
   */
  roles?: (user: U) => string[];
}

/**
 * An {@link AuthProvider} that authenticates the user a test sent with
 * `.as(user)`.
 *
 * The user travels with the `Request` object itself, never in a header, so
 * this provider cannot be talked into authenticating anyone outside a test,
 * even if it were shipped by mistake.
 */
export class TestAuthProvider<U = unknown> extends AuthProvider<U> {
  /** Users by the request they were sent with. */
  private readonly fUsers: WeakMap<Request, U>;

  /** Reads the roles of a user. */
  private readonly fRoles: (user: U) => string[];

  /**
   * @param users - Users by the request they were sent with
   * @param roles - Reads the roles of a user
   */
  constructor(users: WeakMap<Request, U>, roles: (user: U) => string[]) {
    super();
    this.fUsers = users;
    this.fRoles = roles;
  }

  /**
   * Rejects a request sent without `.as()`, or by a user without one of the
   * roles the route requires. Both end as 401, like any `@Auth()` failure.
   *
   * @param request - The request
   * @param params - What `@Auth()` requires
   * @returns An error message, or null when the request may go through
   */
  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): string | null {
    if (!this.fUsers.has(request)) {
      return 'Unauthorized';
    }

    const required = params?.roles ?? [];

    if (required.length === 0) {
      return null;
    }

    const roles = this.fRoles(this.fUsers.get(request)!);

    return required.some((role) => roles.includes(role)) ? null : 'Forbidden';
  }

  /**
   * Returns the user the request was sent as, which is what `@User()` gets.
   *
   * @param request - The request
   * @returns The user, or null
   */
  public getCurrentUser(request: Request): U | null {
    return this.fUsers.get(request) ?? null;
  }
}

/**
 * Authenticates requests sent with `.as(user)`, for routes behind `@Auth()`.
 * Binds a {@link TestAuthProvider} as the `AuthProvider`, replacing the
 * application's own.
 *
 * @param options - How to read a user's roles
 * @returns The extension
 *
 * @example
 * ```ts
 * const app = await createTestApp({ controllers: [AdminController], extensions: [testAuth()] });
 *
 * await app.get('/admin').expect(401);
 * await app.get('/admin').as({ id: '1', roles: ['admin'] }).expect(200);
 * ```
 */
export function testAuth<U = any>(options: TestAuthOptions<U> = {}): TestingTypes.Extension {
  const users = new WeakMap<Request, U>();
  const roles = options.roles ?? ((user: U) => ((user as { roles?: string[] } | null)?.roles ?? []) as string[]);

  return {
    name: 'testAuth',
    beforeInitialize: (app) => {
      app.container.bindInstance(AuthProvider, new TestAuthProvider<U>(users, roles));
    },
    ready: (testApp: TestApp) => {
      testApp.useImpersonator((request, user) => {
        users.set(request, user as U);
      });
    },
  };
}
