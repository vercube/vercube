import { QueueStrategy } from '../Services/QueueStrategy';
import { ATTEMPT_HEADER, generateJobId, readNumericHeader } from '../Utils/Job';
import type { QueueTypes } from '../Types/QueueTypes';

/** A job waiting in, or running on, an in-memory queue. */
interface MemoryJob {
  id: string;
  job: string;
  payload: unknown;
  headers: Record<string, string>;
  attempt: number;
  priority: number;
  sequence: number;
  progress?: number | Record<string, unknown>;
}

/** State the strategy keeps per queue. */
interface MemoryQueue {
  waiting: MemoryJob[];
  timers: Set<ReturnType<typeof setTimeout>>;
  active: number;
  completed: number;
  failed: number;
  consumer?: { concurrency: number; dispatch: (job: QueueTypes.IncomingJob) => Promise<void> };
}

/**
 * In-process queue implementation.
 *
 * Jobs never leave the running process, which makes this the strategy to use in
 * tests, in examples and for background work that may be lost on restart. It is
 * also the reference implementation: delays, priorities and progress all behave
 * exactly as the module documents them.
 *
 * @example
 * ```ts
 * await queueManager.mount({ strategy: MemoryStrategy });
 * ```
 */
export class MemoryStrategy extends QueueStrategy {
  /** Transport this strategy talks to. */
  public readonly transport: string = 'memory';

  /** Queues created so far, indexed by name */
  private fQueues: Map<string, MemoryQueue> = new Map();

  /** Monotonic counter keeping jobs of equal priority in publish order */
  private fSequence: number = 0;

  /** Callbacks waiting for a condition on the queues to hold */
  private fWaiters: { ready: () => boolean; resolve: () => void }[] = [];

  /**
   * Everything the module offers is supported, jobs simply live in memory.
   *
   * @returns {QueueTypes.Capabilities} What this strategy supports
   */
  public override get capabilities(): QueueTypes.Capabilities {
    return {
      retries: false,
      delay: true,
      priority: true,
      progress: true,
      stats: true,
    };
  }

  /**
   * Nothing to connect to.
   *
   * @returns {void}
   */
  public initialize(): void {
    // an in-memory queue has no connection to establish
  }

  /**
   * Adds a job to an in-memory queue, honouring its delay and priority.
   *
   * @param {QueueTypes.PublishRequest} request - Job to publish
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job
   */
  public async publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef> {
    const queue = this.queueFor(request.queue);
    const job: MemoryJob = {
      id: request.options.jobId ?? generateJobId(),
      job: request.job,
      payload: request.payload,
      headers: request.headers,
      attempt: readNumericHeader(request.headers[ATTEMPT_HEADER], 1),
      priority: request.options.priority ?? 0,
      sequence: this.fSequence++,
    };

    const delay = request.options.delay ?? 0;

    if (delay > 0) {
      const timer = setTimeout(() => {
        queue.timers.delete(timer);
        queue.waiting.push(job);
        this.pump(request.queue);
      }, delay);

      timer.unref?.();
      queue.timers.add(timer);
    } else {
      queue.waiting.push(job);
      this.pump(request.queue);
    }

    return { id: job.id, queue: request.queue, job: request.job, strategy: this.transport };
  }

  /**
   * Starts processing a queue. Only one consumer per queue is kept, a second
   * call replaces the first.
   *
   * @param {QueueTypes.ConsumeRequest} request - Queue to consume, its concurrency and the dispatch callback
   * @returns {Promise<QueueTypes.ConsumerHandle>} Handle used to stop the consumer again
   */
  public async consume(request: QueueTypes.ConsumeRequest): Promise<QueueTypes.ConsumerHandle> {
    const queue = this.queueFor(request.queue);

    queue.consumer = { concurrency: Math.max(1, request.concurrency), dispatch: request.dispatch };
    this.pump(request.queue);

    return {
      queue: request.queue,
      stop: async () => {
        // in-flight jobs are awaited, jobs still waiting stay untouched
        await this.waitFor(() => queue.active === 0);
        queue.consumer = undefined;
      },
    };
  }

  /**
   * Reads the counters of a queue.
   *
   * @param {string} name - Queue to read
   * @returns {Promise<QueueTypes.QueueStats>} Counters of that queue
   */
  public override async stats(name: string): Promise<QueueTypes.QueueStats> {
    const queue = this.fQueues.get(name);

    return {
      waiting: queue?.waiting.length ?? 0,
      active: queue?.active ?? 0,
      completed: queue?.completed ?? 0,
      failed: queue?.failed ?? 0,
      delayed: queue?.timers.size ?? 0,
    };
  }

  /**
   * Drops every queue, pending job and delay timer.
   *
   * @returns {Promise<void>} Resolves once everything is dropped
   */
  public async close(): Promise<void> {
    for (const queue of this.fQueues.values()) {
      for (const timer of queue.timers) {
        clearTimeout(timer);
      }

      queue.timers.clear();
      queue.waiting.length = 0;
      queue.consumer = undefined;
    }

    this.fQueues.clear();
    this.notify();
  }

  /**
   * Waits until no job is waiting, delayed or running.
   * Handy in tests, where publishing and processing happen in the same process.
   *
   * @returns {Promise<void>} Resolves once every queue ran dry
   */
  public async idle(): Promise<void> {
    return this.waitFor(() => this.isIdle());
  }

  /**
   * Hands as many waiting jobs to the consumer as its concurrency allows.
   *
   * @param {string} name - Queue to pump
   * @returns {void}
   */
  private pump(name: string): void {
    const queue = this.fQueues.get(name);

    if (!queue?.consumer) {
      return;
    }

    while (queue.consumer && queue.active < queue.consumer.concurrency && queue.waiting.length > 0) {
      const job = this.takeNext(queue);

      if (!job) {
        break;
      }

      queue.active++;
      void this.run(name, queue, job);
    }

    this.notify();
  }

  /**
   * Runs a single job and keeps the queue moving afterwards.
   *
   * A rejected dispatch means the job failed for good: the manager has already
   * applied the retry policy, so nothing is put back on the queue.
   *
   * @param {string} name - Queue the job belongs to
   * @param {MemoryQueue} queue - State of that queue
   * @param {MemoryJob} job - Job to run
   * @returns {Promise<void>} Resolves once the job settled
   */
  private async run(name: string, queue: MemoryQueue, job: MemoryJob): Promise<void> {
    try {
      await queue.consumer?.dispatch({
        id: job.id,
        job: job.job,
        payload: job.payload,
        headers: job.headers,
        attempt: job.attempt,
        raw: job,
        updateProgress: (progress) => {
          job.progress = progress;
        },
      });

      queue.completed++;
    } catch {
      // the manager owns the retry policy, a failed job is simply dropped here
      queue.failed++;
    } finally {
      queue.active--;
      this.pump(name);
      // pump() returns early once the consumer is gone, so waiters are woken here
      this.notify();
    }
  }

  /**
   * Picks the job to run next: lowest priority value first, publish order otherwise.
   *
   * @param {MemoryQueue} queue - Queue to take from
   * @returns {MemoryJob | undefined} The next job, or undefined when the queue is empty
   */
  private takeNext(queue: MemoryQueue): MemoryJob | undefined {
    if (queue.waiting.length === 0) {
      return undefined;
    }

    let index = 0;

    for (let i = 1; i < queue.waiting.length; i++) {
      const candidate = queue.waiting[i];
      const best = queue.waiting[index];

      if (candidate.priority < best.priority || (candidate.priority === best.priority && candidate.sequence < best.sequence)) {
        index = i;
      }
    }

    return queue.waiting.splice(index, 1)[0];
  }

  /**
   * Returns the state of a queue, creating it on first use.
   *
   * @param {string} name - Queue name
   * @returns {MemoryQueue} State of that queue
   */
  private queueFor(name: string): MemoryQueue {
    let queue = this.fQueues.get(name);

    if (!queue) {
      queue = { waiting: [], timers: new Set(), active: 0, completed: 0, failed: 0 };
      this.fQueues.set(name, queue);
    }

    return queue;
  }

  /**
   * @returns {boolean} True when no job is waiting, delayed or running
   */
  private isIdle(): boolean {
    for (const queue of this.fQueues.values()) {
      if (queue.active > 0 || queue.waiting.length > 0 || queue.timers.size > 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Waits until a condition on the queues holds.
   *
   * @param {() => boolean} ready - Condition to wait for, checked after every job settles
   * @returns {Promise<void>} Resolves once the condition holds
   */
  private waitFor(ready: () => boolean): Promise<void> {
    if (ready()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.fWaiters.push({ ready, resolve });
    });
  }

  /**
   * Wakes everyone whose condition now holds.
   *
   * @returns {void}
   */
  private notify(): void {
    if (this.fWaiters.length === 0) {
      return;
    }

    const pending: typeof this.fWaiters = [];

    for (const waiter of this.fWaiters) {
      if (waiter.ready()) {
        waiter.resolve();
      } else {
        pending.push(waiter);
      }
    }

    this.fWaiters = pending;
  }
}
