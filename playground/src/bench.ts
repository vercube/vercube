import { createApp } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { BenchController } from './Controllers/BenchController';
import type { Container } from '@vercube/di';

const app = await createApp({
  cfg: {
    logLevel: 'error',
    requestLogging: process.env.REQUEST_LOGGING !== 'false',
    requestContext: process.env.REQUEST_CONTEXT !== 'false',
    server: { port: Number(process.env.PORT ?? 3999), host: '127.0.0.1' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});

app.container.expand((container: Container) => {
  container.get(Logger).configure({ logLevel: 'error' });
  container.bind(BenchController);
});

await app.listen();
