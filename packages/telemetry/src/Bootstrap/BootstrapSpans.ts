import { ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import { addIOCDevtoolsHook, IOC } from '@vercube/di';
import { VERCUBE_DI_KEY, VERCUBE_DI_KIND } from '../Common/Attributes';
import type { Context, Tracer } from '@opentelemetry/api';
import type { IOCResolveRecord } from '@vercube/di';

/** Upper bound on buffered construction records, so a pathological app cannot exhaust memory. */
const MAX_RECORDS = 20_000;

/** Name of the span every construction span hangs under. */
export const BOOTSTRAP_SPAN_NAME = 'vercube.bootstrap';

/** A record plus the constructions that happened inside it. */
interface IntervalNode {
  record: IOCResolveRecord;
  children: IntervalNode[];
}

/**
 * Buffers container constructions and replays them as a trace.
 *
 * Bootstrap has to be observed before the container exists, which is earlier
 * than any tracer is available, so the records are buffered and turned into
 * spans afterwards with their original timestamps. The result is that the
 * application's startup shows up in a trace viewer as an ordinary waterfall
 * rather than as a bespoke profiler view.
 */
export class BootstrapRecorder {
  /** Buffered construction records, in emission order. */
  private fRecords: IOCResolveRecord[] = [];

  /** Removes the container observer. */
  private fDetach: (() => void) | null = null;

  /** Whether the records have already been turned into spans. */
  private fEmitted = false;

  /**
   * Starts observing container construction.
   *
   * @returns This recorder
   */
  public install(): this {
    if (this.fDetach) {
      return this;
    }

    this.fDetach = addIOCDevtoolsHook({
      onResolved: (record) => {
        if (this.fEmitted || this.fRecords.length >= MAX_RECORDS) {
          return;
        }

        this.fRecords.push(record);
      },
    });

    return this;
  }

  /** Whether anything is still waiting to be emitted. */
  public get pending(): boolean {
    return !this.fEmitted && this.fRecords.length > 0;
  }

  /**
   * Replays the buffered constructions as spans and stops observing.
   *
   * @param tracer - Tracer the spans are created on
   */
  public emit(tracer: Tracer): void {
    if (this.fEmitted) {
      return;
    }

    this.fEmitted = true;
    this.fDetach?.();
    this.fDetach = null;

    const records = this.fRecords;
    this.fRecords = [];

    if (records.length === 0) {
      return;
    }

    const origin = Math.min(...records.map((record) => record.start));
    const end = Math.max(...records.map((record) => record.end));

    const root = tracer.startSpan(
      BOOTSTRAP_SPAN_NAME,
      { kind: SpanKind.INTERNAL, root: true, startTime: toEpoch(origin) },
      ROOT_CONTEXT,
    );

    for (const node of buildIntervalTree(records)) {
      emitNode(tracer, node, trace.setSpan(ROOT_CONTEXT, root));
    }

    root.end(toEpoch(end));
  }

  /**
   * Discards buffered records and stops observing. Used between tests.
   */
  public reset(): void {
    this.fDetach?.();
    this.fDetach = null;
    this.fRecords = [];
    this.fEmitted = false;
  }
}

/**
 * The process-wide recorder.
 *
 * Bootstrap profiling has to start during config load, before any container or
 * DI-resolved service exists, so this cannot live in the container.
 */
export const bootstrapRecorder = new BootstrapRecorder();

/**
 * Emits one construction span and everything nested inside it.
 *
 * @param tracer - Tracer the span is created on
 * @param node - The construction to emit
 * @param parent - Context carrying the parent span
 */
function emitNode(tracer: Tracer, node: IntervalNode, parent: Context): void {
  const { record } = node;

  const span = tracer.startSpan(
    record.name,
    {
      kind: SpanKind.INTERNAL,
      startTime: toEpoch(record.start),
      attributes: {
        [VERCUBE_DI_KEY]: record.name,
        [VERCUBE_DI_KIND]: toKind(record.type),
        'vercube.di.context': record.context,
      },
    },
    parent,
  );

  const childContext = trace.setSpan(parent, span);

  for (const child of node.children) {
    emitNode(tracer, child, childContext);
  }

  span.end(toEpoch(record.end));
}

/**
 * Rebuilds the construction call tree from nested intervals.
 *
 * The container reports a flat stream of completed constructions, but a
 * construction that finished inside another one was nested in it, which is
 * enough to recover the tree.
 *
 * @param records - Flat records in emission order
 * @returns The roots of the reconstructed tree
 */
function buildIntervalTree(records: readonly IOCResolveRecord[]): IntervalNode[] {
  const sorted = [...records].sort((a, b) => a.start - b.start || b.end - a.end);
  const roots: IntervalNode[] = [];
  const stack: IntervalNode[] = [];

  for (const record of sorted) {
    const node: IntervalNode = { record, children: [] };

    while (stack.length > 0 && stack.at(-1)!.record.end < record.end) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack.at(-1)!.children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

/**
 * Converts a `performance.now()` reading into epoch milliseconds.
 *
 * @param value - Monotonic timestamp
 * @returns Epoch milliseconds
 */
function toEpoch(value: number): number {
  return performance.timeOrigin + value;
}

/**
 * Names a binding's factory type.
 *
 * @param type - Factory type recorded by the container
 * @returns The kind name
 */
function toKind(type: IOC.ServiceFactoryType): string {
  if (type === IOC.ServiceFactoryType.CLASS_SINGLETON) {
    return 'singleton';
  }

  return type === IOC.ServiceFactoryType.CLASS ? 'transient' : 'instance';
}
