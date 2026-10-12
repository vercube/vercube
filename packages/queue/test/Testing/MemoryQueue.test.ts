import { Controller, Post } from '@vercube/core';
import { Inject } from '@vercube/di';
import { createTestApp } from '@vercube/testing';
import { describe, expect, it } from 'vitest';
import { Consumer, Job, QueueManager } from '../../src';
import { withMemoryQueue } from '../../src/Testing';

const welcomed: string[] = [];
let failuresLeft = 0;

@Consumer({ queue: 'emails' })
class EmailConsumer {
  @Job('welcome', { attempts: 3, backoff: { type: 'fixed', delay: 1 } })
  public async welcome(payload: { email: string }): Promise<void> {
    if (failuresLeft > 0) {
      failuresLeft--;
      throw new Error('smtp down');
    }

    welcomed.push(payload.email);
  }
}

@Controller('/signup')
class SignupController {
  @Inject(QueueManager)
  private gQueue!: QueueManager;

  @Post('/')
  public async signup(): Promise<{ ok: true }> {
    await this.gQueue.add({ queue: 'emails', job: 'welcome', payload: { email: 'ada@example.com' } });
    return { ok: true };
  }
}

describe('withMemoryQueue', () => {
  it('should process what a request published', async () => {
    welcomed.length = 0;

    const queue = withMemoryQueue();
    await using app = await createTestApp({ controllers: [SignupController], providers: [EmailConsumer], extensions: [queue] });

    await app.post('/signup').expect(200);
    await queue.drain();

    expect(welcomed).toEqual(['ada@example.com']);
    expect(queue.events()).toMatchObject([{ queue: 'emails', job: 'welcome', status: 'completed' }]);
    expect(queue.manager).toBe(app.resolve(QueueManager));
  });

  it('should wait for the retries too', async () => {
    welcomed.length = 0;
    failuresLeft = 2;

    const queue = withMemoryQueue();
    await using app = await createTestApp({ controllers: [SignupController], providers: [EmailConsumer], extensions: [queue] });

    await app.post('/signup').expect(200);
    await queue.drain();

    expect(welcomed).toEqual(['ada@example.com']);
    expect(queue.events().map((event) => event.status)).toEqual(['retried', 'retried', 'completed']);
  });
});
