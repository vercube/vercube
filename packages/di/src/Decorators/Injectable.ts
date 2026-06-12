/**
 * Marks a class as injectable, making it discoverable by the Vercube Nitro module
 * for automatic registration in the DI container.
 *
 * This decorator is intentionally a no-op at runtime - it exists solely as a
 * compile-time marker that the build-time scanner can detect via AST analysis.
 */
export function Injectable(): ClassDecorator {
  return () => {};
}
