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
