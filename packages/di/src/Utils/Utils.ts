/* eslint-disable unicorn/prefer-native-coercion-functions */
/* eslint-disable unicorn/no-array-for-each */
import { type BaseDecorator } from '../Common/BaseDecorators';
import { Container } from '../Domain/Container';
import { IOC } from '../Types/IOCTypes';

/**
 * This function generates new service key for particular service. Providing
 * name is mandatory because, unlike classes, those unique symbols do not infer
 * their names from code.
 *
 * @param name name of the service
 * @returns unique service identity
 */
export function Identity(name: string): IOC.Identity {
  return Symbol(name);
}

/**
 * A simple type of constructor for class "T"
 */
export interface IClassType<T> {
  new(): T;
}

/**
 * Holds decorator entry struct. It is saved in __decorators array for every class and holds
 * various informations.
 */
export interface IDecoratorEntry {
  classType: any;
  params: any;
  target: any;
  propertyName: string;
  descriptor: PropertyDescriptor;
}

/**
 * This is a type for every class instance that is decorated. It should contain hidden __decorators
 * array that holds information about all decorators used in this class. It will be used later for
 * turning those declarations for real code.
 */
export interface IDecoratedPrototype {
  __decorators?: IDecoratorEntry[];
  __metadata?: any;
}

export interface IDecoratedInstance {
  __decoratorInstances?: BaseDecorator<any>[];
}

/**
 * This function creates ES6 decorator based on class that was passed in argument.
 *
 * @param decoratorClass class of decorator that will be used
 * @param params custom options object that will be availalbe in "options" property of decorator class
 * @return ES6 decorator function
 */
export function createDecorator<P, T extends BaseDecorator<P>>(decoratorClass: IClassType<T>, params: P): Function {
  // standaard ES6 decorator code...
  return function internalDecorator(target: IDecoratedPrototype, propertyName: string, descriptor: PropertyDescriptor): any {

    // if target instance does not have __decorators magic array, create it
    if (!target.__decorators) {
      target.__decorators = [];
    }

    // push decorator information to magic array
    target.__decorators.push({
      classType: decoratorClass,
      params,
      target,
      propertyName,
      descriptor,
    });

  };

}

/**
 * This interface repesents decorator metadata object for particular IOC container. We are storing this in
 * map, so we can properly cleaup after request.
 */
interface IContainerDecoratorMetadata {
  decoratedInstances: Map<IDecoratedInstance, BaseDecorator<unknown>[]>;
}

/**
 * This map holds map of Container:DecoratorMetadata values. For every container created,
 * we must hold array of decorated instances, we realize it by holding map where key is
 * container (for easier removal later) and value is IContainerDecoratorMetadataObject.
 */
const containerMap: Map<Container, IContainerDecoratorMetadata> = new Map();

/**
 * Helper function to query data from container
 * @param container container to get metadata fro
 * @return metadata object
 */
function getContainerMetadata(container: Container): IContainerDecoratorMetadata {
  if (!containerMap.has(container)) {
    containerMap.set(container, { decoratedInstances: new Map() });
  }
  return containerMap.get(container)!;
}

/**
 * This function initializes all registered decorators on particular instance. It must be called in order
 * for decorator code work in particular class.
 * @param target class instance to sue
 * @param container IOC container for context
 */
export function initializeDecorators(target: IDecoratedInstance, container: Container): void {
  // get target prototype where metadata is stored
  const prototype: IDecoratedPrototype = Object.getPrototypeOf(target);

  // iterate over __decorators magic field for class
  if (prototype.__decorators) for (const entry of prototype.__decorators) {

    // create decorator class instance using container so all @Injects will work
    const instance: BaseDecorator<unknown> = container.resolve(entry.classType);

    if (instance) {
      // fill instance with data and call the callback
      instance.options = entry.params;
      instance.instance = target;
      instance.prototype = prototype;
      instance.propertyName = entry.propertyName;
      instance.descriptor = entry.descriptor;
      instance.propertyIndex = (typeof entry.descriptor === 'number') ? entry.descriptor : -1;
      instance.created();
    }

    // get container metadata from map
    const { decoratedInstances } = getContainerMetadata(container);

    // get instance list for this class (fallback to empty array) and add new instance
    const instanceList = decoratedInstances.get(target) ?? [];
    instanceList.push(instance);
    decoratedInstances.set(target, instanceList); // save it to instance list

  }

}

/**
 * This function releases all decorators applied to target instance by calling their .destroyed()
 * method. Its used to provide a way for cleanup for decorators. @see BaseDecorator.destroy()
 *
 * @param target instance of class that should have decorators cleaned up
 * @param container ioc container
 */
export function destroyDecorators(target: IDecoratedInstance, container: Container): void {

  // get container metadata from map
  const { decoratedInstances } = getContainerMetadata(container);

  // iterate over registered decorators in particular class
  const instanceList = decoratedInstances.get(target);
  if (instanceList) for (const instance of instanceList) instance.destroyed();

  // cleanup entry in instance map
  decoratedInstances.delete(target);

}

/**
 * This function is responsible for preparing IOC container to work with all decorators. It simply
 * initializes all decorators on all services registered.
 * @param container IOC container
 */
export function initializeContainer(container: Container): void {
  // for backward compatability reason, we simply flush container here
  // this method should be removed in the future however
  container.flushQueue();
}

/**
 * This function is responsible for preparing IOC container to work with all decorators. It simply
 * initializes all decorators on all services registered.
 * @param container IOC container
 */
export function destroyContainer(container: Container): void {

  // destroy all decorators in service
  container.getAllServices().forEach((service: IDecoratedInstance) => destroyDecorators(service, container));

  // destroy the decorator data itself
  containerMap.delete(container);

}
