import { defineRecipe } from '../Apply';
import { useRedis } from './Services';
import { IMAGES, VERSIONS } from './Versions';
import type { Project } from '../Project';

const CONSUMER = `import { Consumer, Job } from '@vercube/queue';
import type { QueueTypes } from '@vercube/queue';

/**
 * Handles the jobs of the \`emails\` queue. Binding it in the container is what
 * starts consuming.
 */
@Consumer({ queue: 'emails', concurrency: 5 })
export default class EmailConsumer {
  @Job('welcome', { attempts: 3, backoff: { type: 'exponential', delay: 250 } })
  public async welcome(payload: { userId: string }, context: QueueTypes.JobContext): Promise<void> {
    context.logger?.info(\`sending the welcome mail to \${payload.userId}\`);
  }
}
`;

const CONTROLLER = `import { Body, Controller, Post } from '@vercube/core';
import { Inject } from '@vercube/di';
import { QueueManager } from '@vercube/queue';
import type { QueueTypes } from '@vercube/queue';

/**
 * curl -X POST localhost:3000/api/jobs/welcome -H 'content-type: application/json' -d '{"userId":"u-42"}'
 */
@Controller('/api/jobs')
export default class JobsController {
  @Inject(QueueManager)
  private gQueue!: QueueManager;

  @Post('/welcome')
  public async welcome(@Body() body: { userId?: string }): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({ queue: 'emails', job: 'welcome', payload: { userId: body?.userId ?? 'anonymous' } });
  }
}
`;

/** The strategy of each driver: its class, its options as code, and what it needs. */
const DRIVERS: Record<string, { strategy: string; options?: string; setup?: (project: Project) => void }> = {
  memory: { strategy: 'MemoryStrategy' },
  bullmq: {
    strategy: 'BullMQStrategy',
    options: `{ connection: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' } }`,
    setup: (project) => {
      // BullMQ loads ioredis at runtime without depending on it
      project.addDependencies({ bullmq: VERSIONS.bullmq, ioredis: VERSIONS.ioredis });
      useRedis(project);
    },
  },
  rabbitmq: {
    strategy: 'RabbitMQStrategy',
    options: `{ url: process.env.RABBITMQ_URL ?? 'amqp://127.0.0.1:5672' }`,
    setup: (project) => {
      project.addDependencies({ amqplib: VERSIONS.amqplib });
      project.addComposeService('rabbitmq', { image: IMAGES.rabbitmq, ports: ['127.0.0.1:5672:5672', '127.0.0.1:15672:15672'] });
      project.addEnv({ RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672' }, 'RabbitMQ');
      project.note('Start the local services with `docker compose up -d`');
    },
  },
  kafka: {
    strategy: 'KafkaStrategy',
    options: `{ client: { clientId: 'app', brokers: (process.env.KAFKA_BROKERS ?? '127.0.0.1:9092').split(',') }, groupId: 'app-workers' }`,
    setup: (project) => {
      project.addDependencies({ kafkajs: VERSIONS.kafkajs });
      project.addComposeService('kafka', { image: IMAGES.kafka, ports: ['127.0.0.1:9092:9092'] });
      project.addEnv({ KAFKA_BROKERS: '127.0.0.1:9092' }, 'Kafka');
      project.note('Start the local services with `docker compose up -d`');
    },
  },
};

export const queueRecipe = defineRecipe<{ driver: string }>({
  id: 'queue',
  label: 'Queue',
  hint: 'background jobs',
  prompts: [
    {
      name: 'driver',
      flag: 'queue',
      message: 'Queue driver?',
      default: 'bullmq',
      options: [
        { value: 'bullmq', label: 'BullMQ', hint: 'Redis' },
        { value: 'rabbitmq', label: 'RabbitMQ' },
        { value: 'kafka', label: 'Kafka' },
        { value: 'memory', label: 'Memory', hint: 'nothing to run, jobs are lost on restart' },
      ],
    },
  ],
  apply: ({ project, answers }) => {
    const driver = DRIVERS[answers.driver] ?? DRIVERS.memory;
    const strategy = `defineQueueStrategy({ strategy: ${driver.strategy}${driver.options ? `, initOptions: ${driver.options}` : ''} })`;

    project.addDependencies({ '@vercube/queue': 'latest' });
    // the native MessagePack decoder of BullMQ, an optional dependency of the module whatever the driver
    project.allowBuilds(['msgpackr-extract']);
    driver.setup?.(project);
    project.addPlugin({
      name: 'QueuePlugin',
      from: '@vercube/queue',
      options: `{ strategies: [${strategy}] }`,
      imports: {
        defineQueueStrategy: '@vercube/queue',
        [driver.strategy]: `@vercube/queue/strategies/${driver.strategy}`,
      },
    });
    project.createFile('src/consumers/EmailConsumer.ts', CONSUMER);
    project.createFile('src/controller/JobsController.ts', CONTROLLER);
    project.bind({ name: 'JobsController', from: '@/controller/JobsController', default: true });
    project.bind({ name: 'EmailConsumer', from: '@/consumers/EmailConsumer', default: true });
  },
});
