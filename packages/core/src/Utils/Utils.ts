import { isSameMiddleware } from './MiddlewareUtils';
import type { MetadataTypes } from '../Types/MetadataTypes';

/**
 * Creates a new metadata context.
 * @returns {MetadataTypes.Ctx} The new metadata context.
 */
export function createMetadataCtx(): MetadataTypes.Ctx {
  return {
    __controller: {
      path: '',
    },
    __middlewares: [],
    __methods: {},
  };
}

/**
 * Creates a new metadata method.
 * @returns {MetadataTypes.Method} The new metadata method.
 */
export function createMetadataMethod(): MetadataTypes.Method {
  return {
    req: null,
    res: null,
    url: null,
    method: null,
    args: [],
    actions: [],
    meta: {},
  };
}

/**
 * Initializes the metadata for a given target and property name.
 * @param {any} target - The target to initialize metadata for.
 * @param {string} propertyName - The name of the property to initialize metadata for.
 */
export function initializeMetadataMethod(target: any, propertyName: string): MetadataTypes.Method {
  if (!target.__metadata.__methods[propertyName]) {
    target.__metadata.__methods[propertyName] = createMetadataMethod();
  }

  return target.__metadata.__methods[propertyName];
}

/**
 * Registers a handler argument in the method metadata.
 * Replaces an existing argument at the same index to keep re-initialization idempotent.
 * @param {MetadataTypes.Method} method - Method metadata to register the argument in.
 * @param {MetadataTypes.Arg} arg - The argument to register.
 */
export function setMetadataArg(method: MetadataTypes.Method, arg: MetadataTypes.Arg): void {
  const index = method.args.findIndex((entry) => entry.idx === arg.idx);

  if (index === -1) {
    method.args.push(arg);
    return;
  }

  method.args[index] = arg;
}

/**
 * Registers a response action in the method metadata.
 * Replaces the action added by the same decorator application, identified by
 * `action.key`, so decorators running once per container stay idempotent.
 * @param {MetadataTypes.Method} method - Method metadata to register the action in.
 * @param {MetadataTypes.Action} action - The action to register.
 */
export function setMetadataAction(method: MetadataTypes.Method, action: MetadataTypes.Action): void {
  const index = action.key === undefined ? -1 : method.actions.findIndex((entry) => entry.key === action.key);

  if (index === -1) {
    method.actions.push(action);
    return;
  }

  method.actions[index] = action;
}

/**
 * Registers a middleware in the metadata context.
 * Skips duplicates identified by target, middleware class and arguments.
 * @param {MetadataTypes.Ctx} meta - Metadata context to register the middleware in.
 * @param {MetadataTypes.Middleware} middleware - The middleware to register.
 * @param {'first' | 'last'} position - Whether the middleware goes to the front of the list.
 */
export function addMetadataMiddleware(
  meta: MetadataTypes.Ctx,
  middleware: MetadataTypes.Middleware,
  position: 'first' | 'last' = 'last',
): void {
  const exists = meta.__middlewares.some((entry) => entry.target === middleware.target && isSameMiddleware(entry, middleware));

  if (exists) {
    return;
  }

  if (position === 'first') {
    meta.__middlewares.unshift(middleware);
    return;
  }

  meta.__middlewares.push(middleware);
}

/**
 * Initializes the metadata for a given target.
 * @param {any} target - The target to initialize metadata for.
 */
export function initializeMetadata(target: any): MetadataTypes.Ctx {
  // A subclass sees its parent's metadata through the prototype chain: writing
  // to it would leak the subclass decorators into the parent and every sibling.
  // It gets a copy of its own instead, so it still inherits the parent's routes,
  // middlewares and controller path.
  if (!Object.hasOwn(target, '__metadata')) {
    target.__metadata = target.__metadata ? copyMetadataCtx(target.__metadata) : createMetadataCtx();
  }

  if (!target.__metadata.__methods) {
    target.__metadata.__methods = {};
  }

  if (!target.__metadata.__middlewares) {
    target.__metadata.__middlewares = [];
  }

  return target.__metadata;
}

/**
 * Copies a metadata context deep enough that changes to the copy never reach
 * the original: every array and plain object is copied, one level into methods.
 * @param {MetadataTypes.Ctx} ctx - The context to copy.
 * @returns {MetadataTypes.Ctx} The copy.
 */
function copyMetadataCtx(ctx: MetadataTypes.Ctx): MetadataTypes.Ctx {
  const copy = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return [...value];
    }

    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return { ...value };
    }

    return value;
  };

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(ctx)) {
    result[key] = copy(value);
  }

  result.__methods = Object.fromEntries(
    Object.entries(ctx.__methods ?? {}).map(([name, method]) => [
      name,
      Object.fromEntries(Object.entries(method).map(([field, value]) => [field, copy(value)])),
    ]),
  );

  return result as unknown as MetadataTypes.Ctx;
}

/**
 * Metadata flag marking a controller as exempt from global middlewares.
 */
const SKIP_GLOBAL_MIDDLEWARES = '__skipGlobalMiddlewares';

/**
 * Exempts every route of a controller from application-wide middlewares.
 *
 * Some endpoints are infrastructure rather than application surface - a health
 * check, a metrics scrape, an inspector - and an application-wide
 * authentication or tenancy middleware guarding them is at best noise and at
 * worst a lockout. Opting out at registration time is what keeps them off the
 * chain; stripping them afterwards would depend on when the route was built.
 *
 * Call it before the container resolves the controller, since the middleware
 * chain is assembled once when the HTTP decorators run.
 *
 * @param {any} target - Controller prototype
 * @returns {void}
 */
export function skipGlobalMiddlewares(target: any): void {
  initializeMetadata(target).__meta = { ...initializeMetadata(target).__meta, [SKIP_GLOBAL_MIDDLEWARES]: true };
}

/**
 * Whether a controller opted out of application-wide middlewares.
 *
 * @param {any} target - Controller prototype
 * @returns {boolean} True when global middlewares must not be attached
 */
export function skipsGlobalMiddlewares(target: any): boolean {
  return target?.__metadata?.__meta?.[SKIP_GLOBAL_MIDDLEWARES] === true;
}
