import type { MetadataTypes } from '../Types/MetadataTypes';

/**
 * Tells whether two middleware entries apply the same middleware with the same arguments.
 *
 * The class alone is not enough: `@Auth()` on a controller and
 * `@Auth({ roles: ['admin'] })` on one of its methods are the same class with
 * different requirements, and treating them as one silently drops the stricter one.
 * Missing arguments and an empty object both mean "no arguments".
 *
 * @param {MetadataTypes.Middleware} a - The first middleware entry.
 * @param {MetadataTypes.Middleware} b - The second middleware entry.
 * @returns {boolean} True when both entries are duplicates of each other.
 */
export function isSameMiddleware(a: MetadataTypes.Middleware, b: MetadataTypes.Middleware): boolean {
  // entries in different slots replace different things, they are never one
  if (a.middleware !== b.middleware || a.slot !== b.slot || Boolean(a.skip) !== Boolean(b.skip)) {
    return false;
  }

  if (isEmptyArgs(a.args) && isEmptyArgs(b.args)) {
    return true;
  }

  return isEqual(a.args, b.args);
}

/**
 * Tells whether middleware arguments are absent or an empty plain object.
 *
 * @param {unknown} args - The middleware arguments.
 * @returns {boolean} True when there are no arguments.
 */
function isEmptyArgs(args: unknown): boolean {
  return args == null || (isPlainObject(args) && Object.keys(args).length === 0);
}

/**
 * Tells whether a value is a plain object, as opposed to an array, a class instance or a function.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} True for plain objects.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Compares arrays and plain objects structurally, everything else by identity -
 * so a class passed as an argument (an auth provider, for instance) matches only itself.
 *
 * @param {unknown} a - The first value.
 * @param {unknown} b - The second value.
 * @returns {boolean} True when both values are equal.
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isEqual(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && isEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Keeps one entry per middleware slot: the last one, as a route collects its
 * entries app-wide first, then the controller's, then the method's. A winning
 * entry marked `skip` empties its slot. Entries without a slot pass through,
 * except one marked `skip`, which never runs.
 *
 * Resolved once per route when its chain is built, never per request.
 *
 * @param {MetadataTypes.Middleware[]} middlewares - Middleware entries, app-wide first.
 * @returns {MetadataTypes.Middleware[]} The entries that run.
 */
export function resolveSlots<T extends Pick<MetadataTypes.Middleware, 'slot' | 'skip'>>(middlewares: T[]): T[] {
  let winners: Map<string, T> | undefined;
  let skipped = false;

  for (const m of middlewares) {
    if (m.slot !== undefined) {
      (winners ??= new Map()).set(m.slot, m);
    }

    skipped ||= m.skip === true;
  }

  if (!winners && !skipped) {
    return middlewares;
  }

  // a skip entry never runs its middleware, with or without a slot
  return middlewares.filter((m) => !m.skip && (m.slot === undefined || winners?.get(m.slot) === m));
}
