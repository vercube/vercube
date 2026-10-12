import { Pool } from 'pg';
import { afterAll, describe } from 'vitest';
import { PostgresStore } from '../../src/Stores/PostgresStore';
import { runReplicaCheck } from './Replicas';
import { runStoreContract } from './StoreContract';

/**
 * Runs against a real PostgreSQL when `DATABASE_URL` is set, for example:
 * `docker run --rm -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:17-alpine` and
 * `DATABASE_URL=postgres://postgres:pg@127.0.0.1:5432/postgres pnpm test`.
 */
const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)('PostgresStore against PostgreSQL', () => {
  runStoreContract('PostgresStore', async () => {
    const tablePrefix = `vercube_scheduler_test_${crypto.randomUUID().replaceAll('-', '')}`;
    const store = new PostgresStore();

    await store.initialize({ connectionString, tablePrefix });

    return {
      store,
      elapse: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      cleanup: async () => {
        await store.close();

        const pool = new Pool({ connectionString });

        await pool.query(`DROP TABLE IF EXISTS "${tablePrefix}_locks", "${tablePrefix}_state"`);
        await pool.end();
      },
    };
  });

  const tablePrefix = `vercube_scheduler_test_${crypto.randomUUID().replaceAll('-', '')}`;

  runReplicaCheck(async () => ({ store: new PostgresStore(), initOptions: { connectionString, tablePrefix } }));

  afterAll(async () => {
    const pool = new Pool({ connectionString });

    await pool.query(`DROP TABLE IF EXISTS "${tablePrefix}_locks", "${tablePrefix}_state"`);
    await pool.end();
  });
});
