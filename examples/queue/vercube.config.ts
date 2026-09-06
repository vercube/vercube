import { defineConfig, withPluginOptions } from '@vercube/core';
import { DevtoolsPlugin } from '@vercube/devtools';
import { defineQueueStrategy, QueuePlugin } from '@vercube/queue';
import { MemoryStrategy } from '@vercube/queue/strategies/MemoryStrategy';

export default defineConfig({
  logLevel: 'debug',
  plugins: [
    DevtoolsPlugin,
    withPluginOptions(QueuePlugin, {
      // the devtools panel lists the processed jobs the manager keeps, so keep more than the default 50
      maxEvents: 200,
      // swap MemoryStrategy for BullMQStrategy, RabbitMQStrategy or KafkaStrategy here,
      // or list several of them side by side, each with its own name
      strategies: [defineQueueStrategy({ strategy: MemoryStrategy })],
    }),
  ],
  server: {
    port: 3000,
  },
});
