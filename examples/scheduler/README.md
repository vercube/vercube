<div align="center">
  <a href="https://vercube.dev/"><img src="../../.github/assets/logo.png" alt="Vercube logo" width="200"></a>
</div>

# Vercube Scheduler Example

Two replicas of the same app, one Redis, and a job that runs once per occurrence however many replicas are up.

`ReportJobs` declares two jobs:

- `reports.build` runs every 10 seconds, cluster scoped: each replica arms a timer, and the one that claims the occurrence in Redis runs it.
- `ReportJobs.heartbeat` runs every 30 seconds on every replica, instance scoped.

## <a name="getting-started">🚀 Quick Start</a>

```sh
$ pnpm i
$ pnpm build
$ docker compose up
```

The replicas answer on `localhost:3000` (`app-1`) and `localhost:3001` (`app-2`). Each `reports.build` occurrence is logged once, by either `app-1` or `app-2`. Each heartbeat is logged twice, once per replica. Stop one replica with `docker compose stop app-1` and the other picks up every occurrence on its own.

Without Docker, run Redis on `127.0.0.1:6379` and start two processes:

```sh
$ PORT=3000 HOSTNAME=app-1 pnpm start
$ PORT=3001 HOSTNAME=app-2 pnpm start
```

## <a name="cli">⌨️ CLI</a>

`SchedulerPlugin` adds two commands to the CLI:

```sh
$ npx vercube scheduler list
$ npx vercube scheduler run reports.build
```

`run` claims the current occurrence, so running it while both replicas are up still runs the job once.
