import type { DecoratorTarget } from '../Utils/Utils';
import { IOCEngine } from '../Domain/Engine';
import { IOC } from '../Types/IOCTypes';


/**
 * Injects a dependency with particular key to service.
 * @param key key to inject
 * @returns decorator
 */
export function InjectOptional(key: IOC.ServiceKey): Function {
  return (target: DecoratorTarget, propertyName: string, propertyIndex: number) => {
    IOCEngine.registerInject(typeof target === 'function' ? target.prototype : target, propertyName, propertyIndex, key, IOC.DependencyType.OPTIONAL);
  };
}
