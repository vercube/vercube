/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * This is base class for all decorators used in Spark. Decorator class must extend this one.
 * This class instance is created using IOC container so you can @Inject() things here.
 */
export abstract class BaseDecorator<T> {

  /** Holds options object that is passed as 2nd argument in createDecorator() factory */
  public options!: T;

  /** Holds class instance that is decorated */
  public instance: any;

  /** Holds class prototype that is decorated */
  public prototype: any;

  /** Holds property name that was decorated */
  public propertyName!: string;

  /** Holds property descriptor that was decorated */
  public descriptor!: PropertyDescriptor;

  /**
   * This method is called when decorator is created and ready to be used.
   */
  public created(): void {}

  /**
   * This method is called when decorator is destroyed for cleanup tasks (like unregistering listeners, clearing timers).
   * For standard services it is called at the end of SSR requests and for Vue components it is called when component is
   * destroyed.
   */
  public destroyed(): void {}

}