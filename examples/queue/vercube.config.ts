import { defineConfig, withPluginOptions } from '@vercube/core';
import { DevtoolsPlugin } from '@vercube/devtools';
import { defineQueueStrategy, QueuePlugin } from '@vercube/queue';
import { RabbitMQStrategy } from '@vercube/queue/strategies/RabbitMQStrategy';

export default defineConfig({
  logLevel: 'debug',
  plugins: [
    DevtoolsPlugin,
    withPluginOptions(QueuePlugin, {
      strategies: [
        defineQueueStrategy({
          strategy: RabbitMQStrategy,
          initOptions: {
            url: 'amqp://localhost:5672',
            prefetch: 1,
          },
        }),
      ],
    }),
  ],
  server: {
    port: 3000,
  },
});
