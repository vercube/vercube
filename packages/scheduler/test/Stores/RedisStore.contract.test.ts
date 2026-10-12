import { describe } from 'vitest';
import { RedisStore } from '../../src/Stores/RedisStore';
import { runReplicaCheck } from './Replicas';
import { runStoreContract } from './StoreContract';

/**
 * Runs against a real Redis when `REDIS_URL` is set, for example:
 * `docker run --rm -p 6379:6379 redis:7-alpine` and `REDIS_URL=redis://127.0.0.1:6379 pnpm test`.
 */
const url = process.env.REDIS_URL;

describe.skipIf(!url)('RedisStore against Redis', () => {
  runStoreContract('RedisStore', async () => {
    const store = new RedisStore();

    await store.initialize({ url, prefix: `vercube:scheduler:test:${crypto.randomUUID()}` });

    return {
      store,
      elapse: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      cleanup: () => store.close(),
    };
  });

  const prefix = `vercube:scheduler:test:${crypto.randomUUID()}`;

  runReplicaCheck(async () => ({ store: new RedisStore(), initOptions: { url, prefix } }));
});
