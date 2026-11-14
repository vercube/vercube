import { describe, test } from 'vitest';
import { z } from 'zod';
import * as core from '../../src';
import { createLadderApp, RUNGS } from './Ladder/Ladder';

/**
 * The benchmark ladder, in process: `app.fetch()` on the bare configuration.
 *
 * It sees the framework's own work and nothing of the server underneath, so it
 * guards against regressions. The numbers that count come from real sockets:
 * `pnpm bench:ladder`. The default configuration is left to that runner, as it
 * writes a log line per request.
 */
const app = await createLadderApp(core, z, { variant: 'bare' });

describe('[Bench] Ladder', () => {
  for (const rung of RUNGS.filter((entry) => entry.variant === 'bare')) {
    test(rung.title, async ({ bench }) => {
      await bench(rung.title, async () => {
        await app.fetch(
          new Request(`http://localhost${rung.path}`, {
            method: rung.method,
            headers: rung.headers,
            body: rung.body,
          }),
        );
      }).run();
    });
  }
});
