import { setIOCDevtoolsHook } from '@vercube/di';
import { toServiceKind } from '../Utils/Introspect';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { Container, IOCResolveRecord } from '@vercube/di';

/** Hard cap on captured resolution records. */
const MAX_RECORDS = 20_000;

/**
 * Profiler state kept at module scope so it can be installed before the container exists.
 */
interface ProfilerState {
  installed: boolean;
  /** True when the profiler was installed before any container was created. */
  early: boolean;
  /** True once bootstrap is finished and recording has stopped. */
  finalized: boolean;
  records: IOCResolveRecord[];
  containers: Container[];
}

const state: ProfilerState = {
  installed: false,
  early: true,
  finalized: false,
  records: [],
  containers: [],
};

/**
 * Installs the IOC devtools hook so every service construction is timed.
 * Prefer calling from the plugin `configure` phase for a complete profile.
 */
export function installBootstrapProfiler(): void {
  if (state.installed) {
    return;
  }

  state.installed = true;
  state.early = state.containers.length === 0;

  setIOCDevtoolsHook({
    onContainerCreated: (container) => {
      state.containers.push(container);
    },
    onResolved: (record) => {
      if (state.finalized || state.records.length >= MAX_RECORDS) {
        return;
      }
      state.records.push(record);
    },
  });
}

/**
 * Stops recording once the application starts serving traffic.
 */
export function finalizeBootstrapProfile(): void {
  state.finalized = true;
}

/**
 * @returns every container observed since the profiler was installed
 */
export function getObservedContainers(): readonly Container[] {
  return state.containers;
}

/**
 * A resolve record enriched with interval-tree relationships.
 */
interface IntervalNode {
  record: IOCResolveRecord;
  children: IntervalNode[];
}

/**
 * Rebuilds the construction call tree from nested resolve intervals.
 * @param records flat resolve records in emission order
 * @returns roots of the reconstructed call tree
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
 * Rounds a millisecond value for JSON transport.
 * @param value raw millisecond value
 * @returns value rounded to three decimals
 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Converts an interval node into the public bootstrap node shape.
 * @param node interval tree node
 * @param origin timestamp of the earliest recorded construction
 * @param hotspots accumulator collecting a flat view of every node
 * @returns serialisable bootstrap node
 */
function toBootstrapNode(
  node: IntervalNode,
  origin: number,
  hotspots: (DevtoolsTypes.BootstrapTiming & { id: string; name: string })[],
): DevtoolsTypes.BootstrapNode {
  const { record } = node;
  const totalMs = record.end - record.start;
  const childrenMs = node.children.reduce((sum, child) => sum + (child.record.end - child.record.start), 0);
  const selfMs = Math.max(0, totalMs - childrenMs);

  hotspots.push({ id: record.name, name: record.name, totalMs: round(totalMs), selfMs: round(selfMs) });

  return {
    id: record.name,
    name: record.name,
    kind: toServiceKind(record.type),
    offsetMs: round(record.start - origin),
    totalMs: round(totalMs),
    selfMs: round(selfMs),
    children: node.children.map((child) => toBootstrapNode(child, origin, hotspots)),
  };
}

/**
 * Builds the bootstrap profile from everything recorded so far.
 * @returns aggregated bootstrap profile
 */
export function getBootstrapProfile(): DevtoolsTypes.BootstrapProfile {
  const records = state.records;

  if (records.length === 0) {
    return { available: state.installed && state.early, totalMs: 0, count: 0, tree: [], hotspots: [] };
  }

  const origin = Math.min(...records.map((record) => record.start));
  const end = Math.max(...records.map((record) => record.end));
  const hotspots: (DevtoolsTypes.BootstrapTiming & { id: string; name: string })[] = [];
  const tree = buildIntervalTree(records).map((node) => toBootstrapNode(node, origin, hotspots));

  hotspots.sort((a, b) => b.selfMs - a.selfMs);

  return {
    available: state.early,
    totalMs: round(end - origin),
    count: records.length,
    tree,
    hotspots: hotspots.slice(0, 50),
  };
}

/**
 * Per-service construction timings keyed by display name.
 * @returns map of service name to aggregated timing
 */
export function getTimingsByName(): Map<string, DevtoolsTypes.BootstrapTiming> {
  const hotspots = getBootstrapProfile().hotspots;
  const map = new Map<string, DevtoolsTypes.BootstrapTiming>();

  for (const entry of hotspots) {
    const existing = map.get(entry.name);
    map.set(
      entry.name,
      existing
        ? { totalMs: round(existing.totalMs + entry.totalMs), selfMs: round(existing.selfMs + entry.selfMs) }
        : { totalMs: entry.totalMs, selfMs: entry.selfMs },
    );
  }

  return map;
}

/**
 * Resets the profiler. Intended for tests.
 */
export function resetBootstrapProfiler(): void {
  setIOCDevtoolsHook(undefined);
  state.installed = false;
  state.early = true;
  state.finalized = false;
  state.records = [];
  state.containers = [];
}
