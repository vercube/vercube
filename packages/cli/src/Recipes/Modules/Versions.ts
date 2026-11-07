/**
 * Versions of the third-party packages the recipes add, the ones the Vercube
 * packages are built and tested against. `@vercube/*` packages are not listed:
 * they are pinned to the version of the CLI applying the recipe.
 */
export const VERSIONS = {
  amqplib: '^2.2.1',
  awsSdkS3: '^3.1163.0',
  azureFunctions: '^4.17.0',
  bullmq: '^6.7.1',
  ioredis: '^6.0.0',
  kafkajs: '^2.2.4',
  pg: '^8.23.1',
  serverless: '^4.46.0',
  serverlessOffline: '^14.8.4',
  vitest: '^5.1.0',
} as const;

/** Docker images of the services the recipes add to docker-compose.yml. */
export const IMAGES = {
  kafka: 'apache/kafka:4.1.0',
  postgres: 'postgres:17-alpine',
  rabbitmq: 'rabbitmq:4-management-alpine',
  redis: 'redis:7-alpine',
} as const;
