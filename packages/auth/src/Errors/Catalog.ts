import { InternalServerError, UnauthorizedError } from '@vercube/core';
import { defineErrorCatalog } from '@vercube/di';

/**
 * The errors of the auth module.
 */
export const AuthErrors = defineErrorCatalog('VERCUBE_AUTH', {
  UNAUTHORIZED: {
    message: ({ message }: { message: string | undefined }) => `${message ?? ''}`,
    why: 'The auth provider rejected the request: its `validate()` returned an error message, or an object with an `error`. The message is the one the provider gave.',
    fix: 'Send the credentials the provider expects. To change who is let in, change `validate()` of the `AuthProvider` that `@Auth()` uses.',
    create: (message) => new UnauthorizedError(message),
  },
  PROVIDER_NOT_REGISTERED: {
    message: ({ source, provider }: { source: string; provider: string }) =>
      `${source}: auth provider "${provider}" is not registered in the container`,
    why: '`@Auth()` or `@User()` asked the container for an auth provider and nothing is bound under that class. The request is refused, as a missing provider must never count as an anonymous caller.',
    fix: 'Bind the provider in the `setup` callback of `createApp()`: `app.container.bind(AuthProvider, MyAuthProvider)`. A class passed as `@Auth({ provider: MyAuthProvider })` is bound as itself: `app.container.bind(MyAuthProvider)`.',
    create: (message) => new InternalServerError(message),
  },
  PROVIDER_RESULT_INVALID: {
    message: ({ provider, received }: { provider: string; received: string }) =>
      `AuthMiddleware: auth provider "${provider}" returned an invalid validate() result (${received}); expected null, a string, { user } or { error }`,
    why: 'The `validate()` method of the auth provider returned something that says neither who the caller is nor why they are refused, such as `false`, `undefined` or a forgotten `return`. The request is refused, never let through.',
    fix: "Return `{ user }` from `validate()` when the request is authenticated and `{ error: 'reason' }` when it is not.",
    create: (message) => new InternalServerError(message),
  },
});
