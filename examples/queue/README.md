<div align="center">
  <a href="https://vercube.dev/"><img src="../../.github/assets/logo.png" alt="Vite logo" width="200"></a>
</div>

# Vercube Queue Example

A minimal example showcasing background jobs in Vercube. It shows a consumer class with `@Consumer()` and `@Job()`, payload validation, retries with backoff, lifecycle hooks, and how to inspect what the queue module holds.

It runs on the in-memory strategy, so **no broker is needed**. See `src/boot/Setup.ts` for the one line that swaps in BullMQ, RabbitMQ or Kafka, or mounts several of them at once.

## <a name="getting-started">🚀 Quick Start</a>

```sh
$ pnpm i
$ pnpm dev
```

## <a name="try-it">📮 Try it</a>

Publish a job and watch the consumer log it:

```sh
$ curl -X POST localhost:3000/api/jobs/welcome -H 'content-type: application/json' -d '{"userId":"u-42"}'
```

Watch three attempts with a growing delay, then a final failure:

```sh
$ curl -X POST localhost:3000/api/jobs/bounce
```

Fail a job on validation, without ever entering the handler and without retrying:

```sh
$ curl -X POST localhost:3000/api/jobs/digest -H 'content-type: application/json' -d '{"userId":"u-42","period":"hourly"}'
```

Hold a job so it can be seen waiting in the queue panel, then open a queue there and read its messages:

```sh
$ curl -X POST localhost:3000/api/jobs/delayed -H 'content-type: application/json' -d '{"delay":120000}'
$ curl 'localhost:3000/_devtools/api/queues/messages?queue=emails'
```

Publish a batch in one round trip, and see what a job nobody handles does:

```sh
$ curl -X POST localhost:3000/api/jobs/batch
$ curl -X POST localhost:3000/api/jobs/unknown
```

Then look at the counters, the registered handlers and the last processed jobs:

```sh
$ curl localhost:3000/api/jobs
$ curl localhost:3000/api/jobs/stats
```

The same picture is available as a UI panel: this example registers `@vercube/devtools`, so open http://localhost:3000/_devtools and pick **Queues**.

## <a name="documentation">📖 Documentation</a>

- [Queue overview](https://vercube.dev/docs/modules/queue/overview)
- [Consumers](https://vercube.dev/docs/modules/queue/consumers)
- [Strategies](https://vercube.dev/docs/modules/queue/strategies)
