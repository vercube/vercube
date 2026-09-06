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
 * Registers a middleware in the metadata context.
 * Skips duplicates identified by target + middleware class.
 * @param {MetadataTypes.Ctx} meta - Metadata context to register the middleware in.
 * @param {MetadataTypes.Middleware} middleware - The middleware to register.
 * @param {'first' | 'last'} position - Whether the middleware goes to the front of the list.
 */
export function addMetadataMiddleware(
  meta: MetadataTypes.Ctx,
  middleware: MetadataTypes.Middleware,
  position: 'first' | 'last' = 'last',
): void {
  const exists = meta.__middlewares.some(
    (entry) => entry.target === middleware.target && entry.middleware === middleware.middleware,
  );

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
  if (!target.__metadata) {
    target.__metadata = createMetadataCtx();
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
