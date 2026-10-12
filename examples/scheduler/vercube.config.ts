import { defineConfig, withPluginOptions } from '@vercube/core';
import { defineSchedulerStore, SchedulerPlugin } from '@vercube/scheduler';
import { RedisStore } from '@vercube/scheduler/stores/RedisStore';

export default defineConfig({
  plugins: [
    withPluginOptions(SchedulerPlugin, {
      // every replica points at the same Redis, which is what decides who runs an occurrence
      store: defineSchedulerStore({ store: RedisStore, initOptions: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' } }),
      // stop cleanly on docker compose down or a Kubernetes rolling update
      handleSignals: true,
    }),
  ],
  server: {
    // 0.0.0.0 inside a container, otherwise the published port reaches nothing
    host: process.env.HOST ?? 'localhost',
    port: Number(process.env.PORT ?? 3000),
  },
});
