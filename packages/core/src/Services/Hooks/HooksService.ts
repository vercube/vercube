/**
 * This module is responsible for managing type-safe hooks observer pattern.
 *
 * You may create an Hook class that will function as single hook with some data,
 * eg:
 *
 * class ECylinderSelected {
 *   public cylinder: ICylinder;
 * }
 *
 * And then you can trigger this hook at any time, passing proper payload:
 *
 * HooksService.trigger(ECylinderSelected, { cylinder: someCylinder });
 *
 * And you can also listen to this hook:
 *
 * HooksService.listen(ECylinderSelected, payload => console.log(payload.cylinder));
 *
 *
 * HooksService.on(ECylinderSelected, payload => console.log(payload.cylinder));
 *
 * Everything 100% typechecked.
 */
import type { HooksTypes } from '../../Types/HooksTypes';

/**
 * This class is responsible for managing events.
 */
export class HooksService {
  // holds last assigned id
  private fLastId: number = 0;

  // holds map of handlers, with key being event class and value is
  // an array of callback handlers
  private fHandlers: Map<HooksTypes.HookType<any>, HooksTypes.HookHandler<any>[]> = new Map();

  /**
   * Registers listener for event of particular type. Everytime event is called, the listener
   * will be executed.
   *
   * @param type type of event, simple class
   * @param callback callback fired when event is triggered
   * @returns unique ID for event listener, can be used to disable this listener
   */
  public on<T>(type: HooksTypes.HookType<T>, callback: HooksTypes.HookCallback<T>): HooksTypes.HookID {
    // get all handlers for particular event type and create empty array there is no events for this yet
    let handlersOfType: HooksTypes.HookHandler<T>[] | undefined = this.fHandlers.get(type);
    if (!handlersOfType) {
      handlersOfType = [];
      this.fHandlers.set(type, handlersOfType);
    }

    // generate unique id
    const genId: number = this.fLastId++;

    // prepare handler
    const handler: HooksTypes.HookHandler<T> = {
      callback,
      id: genId,
    };

    // push handler and return event metadata
    handlersOfType.push(handler);
    return { __id: genId, __type: type };
  }

  /**
   * Waits for single event execution and removes the listener immediately after.
   *
   * @example
   * this.gCart.addItem(product);
   * await this.gEvents.waitFor(CartUpdatedEvent);
   * console.log('here cart updated event is already called');
   *
   * @param type type of event to wait for
   * @param timeout timeout param in ms - if event is not thrown until this time, it'll reject. passing null disables the timeout
   * @returns promise with event data that resolves when event is finally called
   */
  public waitFor<T>(type: HooksTypes.HookType<T>, timeout: number | null = 10 * 1000): Promise<T> {
    return new Promise((resolve, reject) => {
      // define setTimeout variable
      let waitTimeout: any;

      // listen on event type and save eventId
      const eventId = this.on(type, (data) => {
        this.off(eventId);
        resolve(data);
        // if timeout was specified, cancel it
        if (waitTimeout) {
          clearTimeout(waitTimeout);
        }
      });

      // if user passed timeout, set it properly
      if (timeout !== null) {
        waitTimeout = setTimeout(() => {
          // clear the event listener and reject promise
          this.off(eventId);
          reject(new Error(`Waiting for event timeout - ${type.name}`));
        }, timeout);
      }
    });
  }

  /**
   * Removes listener from particular event.
   * @param eventId eventId returned from .on() method.
   * @throws Error if event was not registered
   */
  public off<T>(eventId: HooksTypes.HookID): void {
    const type: HooksTypes.HookType<T> = eventId.__type;
    const handlersOfType: HooksTypes.HookHandler<T>[] | undefined = this.fHandlers.get(type);

    if (!handlersOfType) {
      throw new Error('Trying to unbind event that was not bound.');
    }

    const index = handlersOfType.findIndex((handler) => handler.id === eventId.__id);

    if (index === -1) {
      throw new Error('Trying to unbind event that was not bound.');
    }

    handlersOfType.splice(index, 1);
  }

  /**
   * Triggers event, calling all listener callbacks. Will return Promise of number,
   * that is resolved when all asynchronous listeners are called.
   * @param type type of trigger, simple class
   * @param data data which will be passed to listeners, based on event class
   * @return number of listeners that were notified
   */
  public async trigger<T>(type: HooksTypes.HookType<T>, data?: HooksTypes.HookData<T>): Promise<number> {
    const handlersOfType: HooksTypes.HookHandler<T>[] | undefined = this.fHandlers.get(type);
    if (!handlersOfType) {
      return 0;
    }

    // copy the array as handler might remove the listener itself, modifying original array during iteration
    const toProcessHandlers = [...handlersOfType];

    const promises: Promise<void>[] = toProcessHandlers.map((handler) => {
      const instance: T = this.objectToClass(type, data!);
      const result: void | Promise<void> = handler.callback(instance);
      return result instanceof Promise ? result : Promise.resolve();
    });

    await Promise.all(promises);
    return toProcessHandlers.length;
  }

  /**
   * Converts plain object to it's class equivalent.
   * It's NOT class-transformer, it performs basic key assigment.
   *
   * @param ClassConstructor event constructor
   * @param data event data to be mapped to constructor
   * @return class type of event
   */
  private objectToClass<T>(ClassConstructor: HooksTypes.HookType<T>, data: HooksTypes.HookData<T>): T {
    const instance: T = new ClassConstructor();

    // rewrite data keys to instance
    if (data) {
      for (const key of Object.keys(data)) {
        // copy all properties to convert it to class instance

        const rawInstance: any = instance;
        const rawData: any = data;
        rawInstance[key] = rawData[key];
      }
    }

    return instance;
  }
}
