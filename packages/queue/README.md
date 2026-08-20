<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/queue

### Background jobs for Vercube apps

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fqueue?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fqueue>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**One job model over BullMQ, RabbitMQ, Kafka or plain memory - publish with `add()`, consume with a decorator, and let the module handle retries, timeouts and validation.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **One API, four transports** - BullMQ, RabbitMQ, Kafka and an in-memory strategy, mounted side by side
- **Decorator driven consumers** - `@Consumer()` on the class, `@Job()` on the method, `@AnyJob()` for everything else
- **Retries that work everywhere** - attempts, fixed or exponential backoff, and timeouts, even on transports without them
- **Payload validation** - any Standard Schema validates a job before the handler runs
- **Type-safe queues** - augment the registry and every `add()` is checked against it
- **Devtools ready** - queues, handlers and processed jobs show up in `@vercube/devtools`

## 📦 Installation

```bash
pnpm add @vercube/queue
```

Install the client of the transport you use, they are all optional:

```bash
pnpm add bullmq       # BullMQ, backed by Redis
pnpm add amqplib      # RabbitMQ
pnpm add kafkajs      # Kafka
```

## 📖 Usage

```ts
@Consumer({ queue: 'emails', concurrency: 5 })
export class EmailConsumer {
  @Job('welcome', { attempts: 3, backoff: { type: 'exponential', delay: 1000 } })
  public async welcome(payload: { userId: string }): Promise<void> {
    await this.mailer.send(payload.userId);
  }
}
```

Check out the full [documentation](https://vercube.dev/docs/modules/queue/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
