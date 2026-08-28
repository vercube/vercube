/**
 * Compile-time guards for the mount types. Nothing here runs: every
 * `@ts-expect-error` fails the type check if the mistake below it ever stops
 * being a mistake, which is what keeps `initOptions` honest.
 */
import { QueueManager } from '../../src/Services/QueueManager';
import { KafkaStrategy } from '../../src/Strategies/KafkaStrategy';
import { MemoryStrategy } from '../../src/Strategies/MemoryStrategy';
import { RabbitMQStrategy } from '../../src/Strategies/RabbitMQStrategy';
import { defineQueueStrategy } from '../../src/Utils/Mount';
import { RecordingStrategy } from '../Utils/Mock.mock';

/**
 * Mounts that must be rejected.
 *
 * @param {QueueManager} manager - Manager to mount on
 * @returns {Promise<void>} Never awaited, this function is never called
 */
export async function rejectedMounts(manager: QueueManager): Promise<void> {
  // @ts-expect-error - a strategy that needs options must be given them
  await manager.mount({ strategy: RabbitMQStrategy });

  // @ts-expect-error - options of the wrong shape
  await manager.mount({ strategy: RabbitMQStrategy, initOptions: { url: 123 } });

  // @ts-expect-error - options belonging to another strategy
  await manager.mount({ strategy: KafkaStrategy, initOptions: { url: 'amqp://localhost' } });

  // @ts-expect-error - a strategy that needs no options takes none
  await manager.mount({ strategy: MemoryStrategy, initOptions: { junk: 1 } });

  // @ts-expect-error - unknown option of a strategy that has options
  await manager.mount({ name: 'r', strategy: RecordingStrategy, initOptions: { nope: 1 } });
}

/**
 * Plugin entries that must be rejected.
 *
 * @returns {void}
 */
export function rejectedPluginEntries(): void {
  // @ts-expect-error - a strategy that needs options must be given them
  defineQueueStrategy({ strategy: KafkaStrategy });

  // @ts-expect-error - options belonging to another strategy
  defineQueueStrategy({ strategy: KafkaStrategy, initOptions: { url: 'amqp://localhost' } });

  // @ts-expect-error - a strategy that needs no options takes none
  defineQueueStrategy({ strategy: MemoryStrategy, initOptions: { junk: 1 } });
}

/**
 * Mounts that must be accepted.
 *
 * @param {QueueManager} manager - Manager to mount on
 * @returns {Promise<void>} Never awaited, this function is never called
 */
export async function acceptedMounts(manager: QueueManager): Promise<void> {
  await manager.mount({ strategy: MemoryStrategy });
  await manager.mount({ name: 'jobs', strategy: RabbitMQStrategy, initOptions: { url: 'amqp://localhost' } });
  await manager.mount({
    name: 'events',
    strategy: KafkaStrategy,
    initOptions: { client: { brokers: ['localhost:9092'] }, groupId: 'workers' },
  });

  // options that are optional may be given, left out, or passed as undefined
  await manager.mount({ name: 'r', strategy: RecordingStrategy, initOptions: { label: 'x' } });
  await manager.mount({ name: 'r', strategy: RecordingStrategy, initOptions: undefined });
  await manager.mount({ name: 'r', strategy: RecordingStrategy });

  defineQueueStrategy({ strategy: MemoryStrategy });
  defineQueueStrategy({ name: 'jobs', strategy: RabbitMQStrategy, initOptions: { url: 'amqp://localhost' } });
}
