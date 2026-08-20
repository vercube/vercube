import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Consumer, Job, OnJobCompleted, OnJobFailed } from '@vercube/queue';
import { z } from 'zod';
import type { QueueTypes } from '@vercube/queue';

/** Payload of the digest job. */
interface Digest {
  userId: string;
  period: 'daily' | 'weekly';
}

/** Schema the digest payload is validated against before the handler runs. */
const DigestSchema: z.ZodType<Digest> = z.object({
  userId: z.string().min(1),
  period: z.enum(['daily', 'weekly']),
});

/**
 * Consumer of the `emails` queue.
 *
 * The class decorator picks the queue and sets the defaults every handler
 * inherits, the method decorators pick the jobs. Nothing runs until the class is
 * bound in the container, exactly like a controller.
 */
@Consumer({ queue: 'emails', concurrency: 5 })
export default class EmailConsumer {
  @Inject(Logger)
  private gLogger!: Logger;

  /**
   * Sends a welcome mail. Reports progress on the way, which the in-memory
   * strategy tracks and a broker like BullMQ stores.
   *
   * @param {object} payload - The user the mail is for.
   * @param {QueueTypes.JobContext} context - Everything known about this attempt.
   * @returns {Promise<void>} Resolves once the mail was sent.
   */
  @Job('welcome')
  public async welcome(payload: { userId: string }, context: QueueTypes.JobContext): Promise<void> {
    await context.updateProgress(50);

    // context.logger already carries the queue, job, id and attempt
    context.logger?.info(`sending welcome mail to ${payload.userId}`);
  }

  /**
   * Sends a digest. The payload is validated against a schema first, so a job
   * with a bad shape fails without ever reaching this body, and without retrying.
   *
   * @param {Digest} payload - Whose digest to send, and for which period.
   * @returns {Promise<void>} Resolves once the digest was sent.
   */
  @Job('digest', { schema: DigestSchema, timeout: 10_000 })
  public async digest(payload: Digest): Promise<void> {
    this.gLogger.info(`sending ${payload.period} digest to ${payload.userId}`);
  }

  /**
   * A job that never succeeds, to watch the retry policy work: three attempts,
   * each one waiting twice as long as the last.
   *
   * @returns {Promise<void>} Always rejects.
   * @throws {Error} On every attempt.
   */
  @Job('bounce', { attempts: 3, backoff: { type: 'exponential', delay: 250 } })
  public async bounce(): Promise<void> {
    throw new Error('mailbox does not exist');
  }

  /**
   * Runs after every job of the queue that completed.
   *
   * @param {QueueTypes.JobContext} context - The job that completed.
   * @returns {void}
   */
  @OnJobCompleted()
  public completed(context: QueueTypes.JobContext): void {
    this.gLogger.info(`[queue] ${context.job} done on attempt ${context.attempt}`);
  }

  /**
   * Runs after every failed attempt, so it fires once per retry. Comparing the
   * attempt with the limit tells a retry from a final failure.
   *
   * @param {Error} error - Why the attempt failed.
   * @param {QueueTypes.JobContext} context - The attempt that failed.
   * @returns {void}
   */
  @OnJobFailed()
  public failed(error: Error, context: QueueTypes.JobContext): void {
    const final = context.attempt === context.attempts;

    this.gLogger.warn(`[queue] ${context.job} failed (${context.attempt}/${context.attempts})`, {
      error: error.message,
      final,
    });
  }
}
