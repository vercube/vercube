import { defineRecipe } from '../Apply';
import { usePostgres, useRedis } from './Services';
import { VERSIONS } from './Versions';

/** Jobs that run on every replica, which need no store. */
const INSTANCE_JOBS = `import { Every } from '@vercube/scheduler';
import type { SchedulerTypes } from '@vercube/scheduler';

/**
 * Binding the class in the container is what schedules its jobs.
 */
export default class ReportJobs {
  @Every('30s', { scope: 'instance' })
  public heartbeat(ctx: SchedulerTypes.JobContext): void {
    ctx.logger?.info(\`alive at \${ctx.scheduledAt.toISOString()}\`);
  }
}
`;

/** A job that runs once per occurrence across every replica, claimed in the store. */
const CLUSTER_JOBS = `import { Cron, Every } from '@vercube/scheduler';
import type { SchedulerTypes } from '@vercube/scheduler';

/**
 * Binding the class in the container is what schedules its jobs.
 */
export default class ReportJobs {
  // runs on one replica only, claimed in the store
  @Cron('*/5 * * * *', { name: 'reports.build' })
  public async build(ctx: SchedulerTypes.JobContext): Promise<void> {
    ctx.logger?.info(\`building the report of \${ctx.occurrenceId}\`);
  }

  // runs on every replica
  @Every('30s', { scope: 'instance' })
  public heartbeat(ctx: SchedulerTypes.JobContext): void {
    ctx.logger?.info(\`alive at \${ctx.scheduledAt.toISOString()}\`);
  }
}
`;

export const schedulerRecipe = defineRecipe<{ store: string }>({
  id: 'scheduler',
  label: 'Scheduler',
  hint: 'cron and interval jobs',
  prompts: [
    {
      name: 'store',
      flag: 'scheduler-store',
      message: 'Scheduler store?',
      default: 'memory',
      options: [
        { value: 'memory', label: 'Memory', hint: 'one instance, nothing to run' },
        { value: 'redis', label: 'Redis', hint: 'several replicas' },
        { value: 'postgres', label: 'Postgres', hint: 'several replicas' },
      ],
    },
  ],
  apply: ({ project, answers }) => {
    project.addDependencies({ '@vercube/scheduler': 'latest' });

    let store = 'defineSchedulerStore({ store: MemoryStore })';
    let storeClass = 'MemoryStore';

    if (answers.store === 'redis') {
      project.addDependencies({ ioredis: VERSIONS.ioredis });
      useRedis(project);
      storeClass = 'RedisStore';
      store = `defineSchedulerStore({ store: RedisStore, initOptions: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' } })`;
    } else if (answers.store === 'postgres') {
      project.addDependencies({ pg: VERSIONS.pg });
      usePostgres(project);
      storeClass = 'PostgresStore';
      store = 'defineSchedulerStore({ store: PostgresStore, initOptions: { connectionString: process.env.DATABASE_URL } })';
    }

    project.addPlugin({
      name: 'SchedulerPlugin',
      from: '@vercube/scheduler',
      options: `{ store: ${store} }`,
      imports: { defineSchedulerStore: '@vercube/scheduler', [storeClass]: `@vercube/scheduler/stores/${storeClass}` },
    });
    project.createFile('src/jobs/ReportJobs.ts', answers.store === 'memory' ? INSTANCE_JOBS : CLUSTER_JOBS);
    project.bind({ name: 'ReportJobs', from: '@/jobs/ReportJobs', default: true });
  },
});
