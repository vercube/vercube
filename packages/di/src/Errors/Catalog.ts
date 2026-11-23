import { defineErrorCatalog } from './ErrorCatalog';

/**
 * The errors of the dependency injection container.
 */
export const DiErrors = defineErrorCatalog('VERCUBE_DI', {
  UNRESOLVED: {
    message: ({ key, owner }: { key: string; owner?: string }) =>
      `Unresolved dependency for [${key}]${owner ? ` required by [${owner}]` : ''}`,
    why: 'Something asked the container for a key that nothing was bound to. The class was never passed to `container.bind()`, or it was bound in another container than the one that resolves it.',
    fix: 'Bind it before it is used: `app.container.bind(MyService)` in the `setup` callback of `createApp()`, or `container.bind(Token, MyService)` for a symbol. Use `@InjectOptional(MyService)` when the dependency may be missing.',
  },
  SYMBOL_WITHOUT_IMPLEMENTATION: {
    message: 'Container - provide implementation for binds with symbols.',
    why: '`container.bind()` was called with a symbol and nothing else. A class can be its own implementation, a symbol cannot.',
    fix: 'Pass the class as the second argument: `container.bind($Cache, RedisCache)`.',
  },
  INVALID_FACTORY_TYPE: {
    message: ({ type }: { type: unknown }) => `Container - invalid factory type: ${String(type)}`,
    why: 'A service definition in the container has a type the container does not know. Definitions are created by `bind()`, `bindInstance()`, `bindTransient()` and `bindMock()`, so this one was written into the container by hand, or by another version of `@vercube/di`.',
    fix: 'Register services through the `bind*` methods only, and check with `pnpm why @vercube/di` that one version of the package is installed.',
  },
  INVALID_DEFINITION_TYPE: {
    message: ({ type }: { type: unknown }) => `Container::internalDispose() - invalid def type: ${String(type)}`,
    why: 'While disposing, the container found a service definition with a type it does not know. Definitions are created by `bind()`, `bindInstance()`, `bindTransient()` and `bindMock()`, so this one was written into the container by hand, or by another version of `@vercube/di`.',
    fix: 'Register services through the `bind*` methods only, and check with `pnpm why @vercube/di` that one version of the package is installed.',
  },
  DISPOSED: {
    message: ({ key }: { key: string }) => `Container - disposed, cannot create [${key}]`,
    why: 'The container was disposed, by `app.close()` or `container.dispose()`, and something asked it for an instance it had not created yet.',
    fix: 'Resolve what you need before closing the application. In a test, create a new application with `createApp()` or `createTestApp()` for each case instead of reusing a closed one.',
  },
  DISPOSAL_REJECTED: {
    message: 'Container - disposal rejected',
    why: 'A promise handed to `container.trackDisposal()` rejected without a reason, so there is no original error to report.',
    fix: 'Reject with an `Error` in the `@Destroy()` method or the cleanup that failed, so the cause is visible here.',
  },
  DISPOSE_FAILED: {
    message: (_: { errors: unknown[] }) => 'Container - failed to dispose',
    why: 'One or more services failed while the container was disposed: a `@Destroy()` method threw, or a promise it returned rejected. Every other service was still disposed.',
    fix: 'Read the `errors` of this `AggregateError`: each one is what a `@Destroy()` method threw. Fix the cleanup that failed, or catch inside it what may fail on shutdown.',
    create: (message, { errors }) => new AggregateError(errors, message),
  },
  INVALID_INJECT_METHOD: {
    message: ({ method }: { method: unknown }) => `IOCEngine.injectDeps() - invalid inject method ${String(method)}`,
    why: 'A dependency was registered with an injection method the engine does not know. `@Inject()` and `@InjectOptional()` always register a known one, so the metadata comes from another version of `@vercube/di`.',
    fix: 'Check with `pnpm why @vercube/di` that one version of the package is installed, and dedupe it (`pnpm dedupe`) when there are two.',
  },
});
