import type { QueueTypes } from '../Types/QueueTypes';

/**
 * Consumer options per decorated prototype.
 *
 * A weak map keeps the options off the class itself, so nothing leaks into the
 * instances the container hands out and subclasses inherit them naturally.
 */
const consumers: WeakMap<object, QueueTypes.ConsumerOptions> = new WeakMap();

/**
 * Stores the options a `@Consumer()` class was declared with.
 *
 * @param prototype - Prototype of the decorated class.
 * @param options - Options the class was declared with.
 * @returns Nothing.
 */
export function setConsumerOptions(prototype: object, options: QueueTypes.ConsumerOptions): void {
  consumers.set(prototype, options);
}

/**
 * Reads the options of the closest `@Consumer()` class in the prototype chain,
 * so a handler declared on a base class still finds its queue.
 *
 * @param prototype - Prototype to start looking at.
 * @returns The options, or undefined when no class in the chain is a consumer.
 */
export function getConsumerOptions(prototype: object | null): QueueTypes.ConsumerOptions | undefined {
  let current = prototype;

  while (current) {
    const options = consumers.get(current);

    if (options) {
      return options;
    }

    current = Object.getPrototypeOf(current);
  }

  return undefined;
}
