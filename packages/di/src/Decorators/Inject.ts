import { IOCEngine } from '../Domain/Engine';
import { IOC } from '../Types/IOCTypes';
import type { IDecoratedPrototype } from '../Utils/Utils';

/**
 * Injects a dependency with particular key to service.
 * @param key key to inject
 * @returns decorator
 */
export function Inject(key: IOC.ServiceKey): Function {
  return (target: IDecoratedPrototype, propertyName: string) => {
    IOCEngine.registerInject(target, propertyName, key, IOC.DependencyType.STANDARD);
  };
}
