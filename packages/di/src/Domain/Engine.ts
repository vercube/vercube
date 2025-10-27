/**
 * This module is responsible for internal work of IOC engine inject mechanics. Its written in
 * "raw" (non-OOP) style to maximize simplicity and execution speed.
 */
import { IOC } from '../Types/IOCTypes';
import { Container } from './Container';

/**
 * This is a struct that holds information about class dependency - what dependency, which field to inject,etc.
 */
export interface IClassDep {
  propertyName: string;
  dependency: IOC.ServiceKey;
  type: IOC.DependencyType;
}

/**
 * This holds single "metadata" entry for particular class. It holds all @Inject stuff for class.
 */
export interface IClassMapEntry {
  deps: IClassDep[];
}

declare const globalThis: {
  __IOCClassMap: Map<IOC.Prototype, IClassMapEntry>;
};

/**
 * This map holds metadata for ALL classes in system along with their dependencies. Original idea was
 * to store those informations in object prototype, but accessing this map is blazing fast with Map
 * container (<1ms).
 */
const classMap: Map<IOC.Prototype, IClassMapEntry> = new Map<IOC.Prototype, IClassMapEntry>();
globalThis.__IOCClassMap = globalThis.__IOCClassMap ?? classMap;

// we need to cache root object prototype, we will check it later on
const ROOT_PROTO: object = Object.getPrototypeOf({});

/**
 * Retrieves the class dependency metadata map used for IOC injection purposes.
 *
 * This function checks for a global `classMap` property on `globalThis` (allowing for shared class metadata between
 * multiple contexts or modules, e.g., in hot-reloading environments), and falls back to the internal `classMap` instance
 * if one does not exist. The returned map associates class prototypes with their corresponding inject metadata entries.
 *
 * @returns {Map<IOC.Prototype, IClassMapEntry>} The map of class prototypes to injection metadata entries.
 */
function getMapper(): Map<IOC.Prototype, IClassMapEntry> {
  return globalThis.__IOCClassMap;
}

/**
 * This method registers @Inject() in particular class.
 * @param prototype class prototype for which we register @Inject()
 * @param propertyName name of property that is inejcted
 * @param dependency what we should inject there
 * @param type type of dependency (standard or optional dependency)
 */
function registerInject(
  prototype: IOC.Prototype,
  propertyName: string,
  dependency: IOC.ServiceKey,
  type: IOC.DependencyType,
): void {
  // find entry for this class, create new one if not found
  let entry: IClassMapEntry | undefined = getMapper().get(prototype);
  if (!entry) {
    const newEntry: IClassMapEntry = {
      deps: [],
    };
    entry = newEntry;
    getMapper().set(prototype, entry);
  }

  const newDep: IClassDep = {
    propertyName: propertyName,
    dependency: dependency,
    type: type,
  };
  entry.deps.push(newDep);
}

/**
 * Returns classmap entry for particular class. It holds information about @Injects for this particular class.
 * @param classType type of class to check
 * @returns class map entry or null if cannot be found
 */
function getEntryForClass(classType: IOC.Newable<unknown>): IClassMapEntry | null {
  const entry: IClassMapEntry | undefined = getMapper().get(classType.prototype);
  return entry === undefined ? null : entry;
}

/**
 * Returns array of dependencies for particular class instance.
 * @param instance class instance
 * @returns array of @Inject dependencies defined for this class
 */
function getDeps(instance: IOC.Instance): IClassDep[] {
  // get info for classmap, fallback to empty array if its not defined
  const prototype: IOC.Prototype | null = Object.getPrototypeOf(instance);
  if (!prototype) {
    return [];
  }

  // return data
  const entry: IClassMapEntry | undefined = getMapper().get(prototype);
  return entry !== undefined && entry.deps !== undefined ? entry.deps : [];
}

/**
 * This method injects stuff into class, using container passed as first argument. We need container as
 * inject execution is always context based.
 * @param container container instance that is providing dependencies
 * @param instance class instance to inject
 * @param method inject method, "lazy" queries dep during property access while "static" injects during class creation
 */
function injectDeps(container: Container, instance: IOC.Instance, method: IOC.InjectMethod): void {
  // get class metadata, if there are no @Injects for this class, just skip
  let prototype: IOC.Prototype | null = Object.getPrototypeOf(instance);
  if (!prototype) {
    return;
  }

  /**
   * Here we will traverse through prototype chain until we hit dead end (ROOT_PROTO). This is because we
   * must process inject for current class and also for every base class.
   *
   * So we will use "do" loop to iterate full prototype chain.
   */
  do {
    // get entry for "current prototype"
    const entry: IClassMapEntry | undefined = getMapper().get(prototype);
    if (entry) {
      // iterate over all dependencies for this class..
      for (const iter of entry.deps) {
        const propertyName: string = iter.propertyName;
        const dependency: IOC.ServiceKey = iter.dependency;
        const type: IOC.DependencyType = iter.type;

        // this is a hack for derived classes which improperly override original @Injects()
        // this should be fixed in those bad classess itself so @TODO
        if (Object.prototype.hasOwnProperty.call(instance, propertyName) && instance[propertyName] !== undefined) {
          continue;
        }

        // for optional dependencies, we simply inject it as lazy dep but we allow for null to be passed
        if (type === IOC.DependencyType.OPTIONAL) {
          Object.defineProperty(instance, propertyName, {
            get: function (): any {
              return container.getOptional(dependency);
            },
          });
          continue;
        }

        // depending on inject method, either put the stuff statically or create dynamic getter for that
        switch (method) {
          case IOC.InjectMethod.LAZY: {
            Object.defineProperty(instance, propertyName, {
              get: function (): any {
                return container.get(dependency);
              },
            });
            break;
          }

          case IOC.InjectMethod.STATIC: {
            instance[propertyName] = container.get(dependency);
            break;
          }

          default: {
            throw new Error(`IOCEngine.injectDeps() - invalid inject method ${method}`);
          }
        }
      }
    }

    // walk up to parent class & collect deps again...
    prototype = Object.getPrototypeOf(prototype);

    // repeat until we walk through whole proto chain..
  } while (prototype && prototype !== ROOT_PROTO);
}

export const IOCEngine: {
  registerInject: typeof registerInject;
  getEntryForClass: typeof getEntryForClass;
  injectDeps: typeof injectDeps;
  getDeps: typeof getDeps;
} = {
  registerInject: registerInject,
  getEntryForClass: getEntryForClass,
  injectDeps: injectDeps,
  getDeps: getDeps,
};
