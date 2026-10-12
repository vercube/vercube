<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/scheduler

### Cron and interval jobs for Vercube apps, correct on any number of replicas

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fscheduler?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fscheduler>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Every replica computes the same schedule. A store decides who runs each occurrence, so a cluster job runs once per occurrence, however many pods you scale to.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Decorator driven** - `@Cron()` for cron expressions with time zones, `@Every()` for epoch-aligned intervals
- **Cluster or instance scope** - run an occurrence on exactly one replica, or on every one of them
- **Fails loudly** - a cluster job without a distributed store refuses to start in production instead of running everywhere
- **Run policies** - overlap control, lock heartbeats with an `AbortSignal`, misfire catch-up, timeouts, in-place retries and jitter
- **Graceful shutdown** - in-flight runs are awaited, then aborted, and their locks released
- **Testable** - a `ManualClock` drives the timers, so a test never waits real time

## 📦 Installation

```bash
pnpm add @vercube/scheduler
```

## 📖 Usage

```ts
export class BillingJobs {
  @Cron('0 3 * * *', { name: 'billing.close-day', timezone: 'Europe/Warsaw' })
  public async closeDay(ctx: SchedulerTypes.JobContext): Promise<void> {
    await this.invoices.closeDay({ idempotencyKey: ctx.occurrenceId, signal: ctx.signal });
  }

  @Every('5m', { scope: 'instance' })
  public flushLocalCache(): void {
    localCache.clear();
  }
}
```

Check out the full [documentation](https://vercube.dev/docs/modules/scheduler/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
