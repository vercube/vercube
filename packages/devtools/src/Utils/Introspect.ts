import { BasePlugin } from '@vercube/core';
import { IOC, IOCEngine } from '@vercube/di';
import { FRAMEWORK_SERVICES } from '../Constants/DevtoolsDefaults';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { IClassDep } from '@vercube/di';

/** Prototype of a plain object; stop condition when walking proto chains. */
const ROOT_PROTO: object = Object.getPrototypeOf({});

/**
 * Produces a human readable label for any container service key.
 * @param key service key coming from a `bind*` call
 * @returns display name for the key
 */
export function describeKey(key: IOC.ServiceKey): string {
  if (typeof key === 'symbol') {
    return key.description ?? 'Symbol()';
  }

  if (typeof key === 'string') {
    return key;
  }

  if (typeof key === 'function') {
    return (key as { name?: string }).name || 'Anonymous';
  }

  if (typeof key === 'object' && key !== null) {
    return (key as { constructor?: { name?: string } }).constructor?.name ?? 'Object';
  }

  return 'Unknown';
}

/**
 * Produces a label for the value a key was bound to, or `null` when it is the key itself.
 * @param key service key
 * @param value bound implementation or instance
 * @returns implementation name, or `null` when it adds no information
 */
export function describeImplementation(key: IOC.ServiceKey, value: unknown): string | null {
  if (value === key) {
    return null;
  }

  if (typeof value === 'function') {
    const name = (value as { name?: string }).name;
    return name && name !== describeKey(key) ? name : null;
  }

  if (typeof value === 'object' && value !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    return name && name !== describeKey(key) ? name : null;
  }

  return null;
}

/**
 * Resolves the class constructor behind a service definition, when there is one.
 * @param def service definition from the container
 * @returns the constructor, or `null` for plain values
 */
export function resolveConstructor(def: Readonly<IOC.ServiceDef>): (Function & { prototype: unknown }) | null {
  const value = def.serviceValue;

  if (typeof value === 'function') {
    return value as Function & { prototype: unknown };
  }

  if (typeof value === 'object' && value !== null) {
    const ctor = (value as { constructor?: Function }).constructor;

    // Plain objects and arrays are configuration values, not services.
    if (ctor === Object || ctor === Array || typeof ctor !== 'function') {
      return null;
    }

    return ctor as Function & { prototype: unknown };
  }

  return null;
}

/**
 * Collects every `@Inject` / `@InjectOptional` declaration of a class, including inherited ones.
 * @param ctor class constructor to inspect
 * @returns flat list of dependency declarations, nearest prototype first
 */
export function collectClassDeps(ctor: (Function & { prototype: unknown }) | null): IClassDep[] {
  if (!ctor?.prototype) {
    return [];
  }

  const deps: IClassDep[] = [];
  const seen = new Set<string>();
  let proto: object | null = ctor.prototype as object;

  while (proto && proto !== ROOT_PROTO) {
    const entry = IOCEngine.getEntryForClass({ prototype: proto } as unknown as IOC.Newable<unknown>);

    for (const dep of entry?.deps ?? []) {
      if (seen.has(dep.propertyName)) {
        continue;
      }
      seen.add(dep.propertyName);
      deps.push(dep);
    }

    proto = Object.getPrototypeOf(proto);
  }

  return deps;
}

/**
 * Reads the controller base path declared by `@Controller()`, if any.
 * @param ctor class constructor to inspect
 * @returns the base path, or `undefined` when the class is not a controller
 */
export function readControllerPath(ctor: (Function & { prototype: unknown }) | null): string | undefined {
  const metadata = (ctor?.prototype as { __metadata?: { __controller?: { path?: string } } } | undefined)?.__metadata;
  return metadata?.__controller?.path;
}

/**
 * Classifies a container entry so the graph can group and colour it.
 * @param name display name of the service key
 * @param def service definition from the container
 * @param ctor constructor behind the definition, when available
 * @returns the role of the service
 */
export function classifyService(
  name: string,
  def: Readonly<IOC.ServiceDef>,
  ctor: (Function & { prototype: unknown }) | null,
): DevtoolsTypes.ServiceRole {
  if (readControllerPath(ctor) !== undefined) {
    return 'controller';
  }

  const prototype = ctor?.prototype as Record<string, unknown> | undefined;

  if (prototype && (typeof prototype.onRequest === 'function' || typeof prototype.onResponse === 'function')) {
    return 'middleware';
  }

  if (typeof ctor === 'function' && (ctor === BasePlugin || ctor.prototype instanceof BasePlugin)) {
    return 'plugin';
  }

  if (FRAMEWORK_SERVICES.has(name)) {
    return 'framework';
  }

  if (!ctor) {
    return 'value';
  }

  return 'service';
}

/**
 * Maps a container factory type onto the devtools binding kind.
 * @param type factory type recorded by the container
 * @returns matching devtools binding kind
 */
export function toServiceKind(type: IOC.ServiceFactoryType): DevtoolsTypes.ServiceKind {
  switch (type) {
    case IOC.ServiceFactoryType.CLASS_SINGLETON: {
      return 'singleton';
    }
    case IOC.ServiceFactoryType.CLASS: {
      return 'transient';
    }
    default: {
      return 'instance';
    }
  }
}
