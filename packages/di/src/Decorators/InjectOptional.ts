import type { IDecoratedPrototype } from '../Utils/Utils';
import { IOCEngine } from '../Domain/Engine';
import { IOC } from '../Types/IOCTypes';

/**
 * Injects a dependency with particular key to service.
 * @param key key to inject
 * @returns decorator
 */
export function InjectOptional(key: IOC.ServiceKey): Function {
  return (target: IDecoratedPrototype, propertyName: string) => {
    IOCEngine.registerInject(target, propertyName, key, IOC.DependencyType.OPTIONAL);
  };
}
