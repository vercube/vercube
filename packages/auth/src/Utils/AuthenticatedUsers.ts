import type { AuthProvider } from '../Services/AuthProvider';
import type { RequestContext } from '@vercube/core';

/**
 * Key under which the users authenticated during a request are stored in {@link RequestContext}.
 */
export const AUTH_USERS_KEY = 'auth:users';

/**
 * Users authenticated during one request, by the provider that authenticated them.
 *
 * Keyed by provider so `@User({ provider })` never receives a user some other
 * provider vouched for.
 */
type AuthenticatedUsers = Map<typeof AuthProvider<any>, unknown>;

/**
 * Remembers the user a provider authenticated, for the rest of the request.
 *
 * Does nothing without an active request context (`requestContext: false`),
 * in which case `@User()` falls back to `getCurrentUser()`.
 *
 * @param {RequestContext | null} context - The request context
 * @param {typeof AuthProvider} provider - The provider that authenticated the user
 * @param {unknown} user - The authenticated user
 * @returns {void}
 */
export function rememberUser(context: RequestContext | null, provider: typeof AuthProvider<any>, user: unknown): void {
  if (!context?.active) {
    return;
  }

  let users = context.get<AuthenticatedUsers>(AUTH_USERS_KEY);

  if (!users) {
    users = new Map();
    context.set(AUTH_USERS_KEY, users);
  }

  users.set(provider, user);
}

/**
 * Looks up the user a provider authenticated earlier in the request.
 *
 * @param {RequestContext | null} context - The request context
 * @param {typeof AuthProvider} provider - The provider to look up
 * @returns {{ user: unknown } | undefined} The user, wrapped so a `null` user is told apart from none
 */
export function recallUser(context: RequestContext | null, provider: typeof AuthProvider<any>): { user: unknown } | undefined {
  const users = context?.active ? context.get<AuthenticatedUsers>(AUTH_USERS_KEY) : undefined;

  return users?.has(provider) ? { user: users.get(provider) } : undefined;
}
