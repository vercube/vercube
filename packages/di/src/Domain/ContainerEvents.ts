import type { IOC } from '../Types/IOCTypes';

export type OnExpandedEvent = (serviceKeys: IOC.ServiceKey[]) => void;

/**
 * This class allows for container to listen on various IOC events.
 */
export class ContainerEvents {
  private fOnExpanded: OnExpandedEvent[] = [];

  /**
   * Registers to container "onExpanded" event.
   * @param handler event handler
   */
  public onExpanded(handler: OnExpandedEvent): void {
    this.fOnExpanded.push(handler);
  }

  /**
   * Calls on expanded event.
   * @param serviceKeys key of service we have installed
   */
  public callOnExpanded(serviceKeys: IOC.ServiceKey[]): void {
    for (const handler of this.fOnExpanded) handler(serviceKeys);
  }
}
