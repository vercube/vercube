import { BadRequestError, Body, Controller, Get, Post } from '@vercube/core';
import { Inject } from '@vercube/di';
import { QueueManager } from '@vercube/queue';
import type { QueueTypes } from '@vercube/queue';

/**
 * Publishes jobs the {@link EmailConsumer} handles, and exposes what the queue
 * module currently holds.
 */
@Controller('/api/jobs')
export default class JobsController {
  @Inject(QueueManager)
  private gQueue!: QueueManager;

  /**
   * Publishes a welcome mail job.
   *
   * @param {object} body - The user the mail is for.
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job.
   */
  @Post('/welcome')
  public async welcome(@Body() body: { userId?: string }): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({
      queue: 'emails',
      job: 'welcome',
      payload: { userId: body?.userId ?? 'anonymous' },
    });
  }

  /**
   * Publishes a digest job. Its payload is validated on the consumer side, so
   * posting a bad `period` fails the job instead of the request.
   *
   * @param {object} body - Whose digest to send, and for which period.
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job.
   */
  @Post('/digest')
  public async digest(@Body() body: { userId?: string; period?: string }): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({
      queue: 'emails',
      job: 'digest',
      payload: { userId: body?.userId ?? 'anonymous', period: body?.period ?? 'daily' },
    });
  }

  /**
   * Publishes a job that keeps failing, to watch attempts and backoff.
   *
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job.
   */
  @Post('/bounce')
  public async bounce(): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({ queue: 'emails', job: 'bounce', payload: {} });
  }

  /**
   * Publishes a batch of digests in one round trip.
   *
   * @param {object} body - The users to send a digest to.
   * @returns {Promise<QueueTypes.JobRef[]>} References to the published jobs.
   */
  @Post('/batch')
  public async batch(@Body() body: { userIds?: string[] }): Promise<QueueTypes.JobRef[]> {
    const userIds = body?.userIds ?? ['a', 'b', 'c'];

    // @Body() parses JSON, it does not check it against the declared type, so
    // `{"userIds":"one"}` would reach the map below and fail as a 500.
    if (!Array.isArray(userIds) || userIds.some((userId) => typeof userId !== 'string')) {
      throw new BadRequestError('userIds must be an array of strings');
    }

    return this.gQueue.addMany({
      queue: 'emails',
      job: 'digest',
      payloads: userIds.map((userId) => ({ userId, period: 'daily' as const })),
    });
  }

  /**
   * Publishes a welcome mail that only becomes available later, so it can be
   * seen waiting in the devtools queue panel.
   *
   * @param {object} body - How long to hold the job, in milliseconds.
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job.
   */
  @Post('/delayed')
  public async delayed(@Body() body: { delay?: number }): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({
      queue: 'emails',
      job: 'welcome',
      payload: { userId: 'later' },
      options: { delay: body?.delay ?? 60_000 },
    });
  }

  /**
   * Publishes a job nobody handles, to show what happens to it.
   *
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job.
   */
  @Post('/unknown')
  public async unknown(): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({ queue: 'emails', job: 'not-handled-by-anyone', payload: {} });
  }

  /**
   * @returns {QueueTypes.Snapshot} Mounted strategies, handlers, counters and the last processed jobs.
   */
  @Get('/')
  public inspect(): QueueTypes.Snapshot {
    return this.gQueue.inspect();
  }

  /**
   * @returns {Promise<QueueTypes.QueueStats>} The counters the transport itself keeps.
   */
  @Get('/stats')
  public stats(): Promise<QueueTypes.QueueStats> {
    return this.gQueue.stats({ queue: 'emails' });
  }
}
