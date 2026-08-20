import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Consumer, Job, OnJobCompleted, OnJobFailed } from '@vercube/queue';
import type { QueueTypes } from '@vercube/queue';

/**
 * Consumer demonstrating the usage of the Queue module.
 * Reads the `emails` queue and handles two kinds of jobs: one that succeeds and
 * one that always fails, so retries and the failure hook can be observed.
 */
@Consumer({ queue: 'emails', concurrency: 2 })
export class EmailConsumer {
  /**
   * The logger instance.
   */
  @Inject(Logger)
  private gLogger!: Logger;

  /**
   * Handles a welcome mail.
   *
   * @param {object} payload - The user the mail is for
   * @param {QueueTypes.JobContext} context - Everything known about this attempt
   * @returns {Promise<void>} Resolves once the mail was sent
   */
  @Job('welcome')
  public async welcome(payload: { userId: string }, context: QueueTypes.JobContext): Promise<void> {
    await context.updateProgress(50);

    this.gLogger.info(`[queue] welcome mail for ${payload.userId}`, { jobId: context.id });
  }

  /**
   * Job that never succeeds, to show the retry policy at work.
   *
   * @returns {Promise<void>} Always rejects
   * @throws {Error} On every attempt
   */
  @Job('bounce', { attempts: 3, backoff: { type: 'exponential', delay: 250 } })
  public async bounce(): Promise<void> {
    throw new Error('mailbox does not exist');
  }

  /**
   * Reports a completed job.
   *
   * @param {QueueTypes.JobContext} context - The job that completed
   * @returns {void}
   */
  @OnJobCompleted()
  public completed(context: QueueTypes.JobContext): void {
    this.gLogger.debug(`[queue] ${context.job} done in attempt ${context.attempt}`);
  }

  /**
   * Reports a failed attempt.
   *
   * @param {Error} error - Why the attempt failed
   * @param {QueueTypes.JobContext} context - The attempt that failed
   * @returns {void}
   */
  @OnJobFailed()
  public failed(error: Error, context: QueueTypes.JobContext): void {
    const last = context.attempt === context.attempts;

    this.gLogger.warn(`[queue] ${context.job} failed (${context.attempt}/${context.attempts})`, {
      error: error.message,
      final: last,
    });
  }
}
