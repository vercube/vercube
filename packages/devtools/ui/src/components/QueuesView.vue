<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { formatMs, useResource } from '../api';
import { useInspectorWidth } from '../inspector';
import PageHeader from './PageHeader.vue';
import SplitHandle from './SplitHandle.vue';
import type { QueueJob, QueueLine, QueueView } from '../api';

const { data, error, loading, reload } = useResource<QueueView>('/api/queues');

const query = ref('');
const selectedId = ref<string | null>(null);

const DEFAULT_INSPECTOR_WIDTH = 400;

const inspectorWidth = useInspectorWidth('queues-inspector', DEFAULT_INSPECTOR_WIDTH);

/** Queues match on their own name, their strategy or any job they handle. */
const queues = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return (data.value?.queues ?? []).filter(
    (queue) =>
      !needle ||
      queue.queue.toLowerCase().includes(needle) ||
      queue.strategy.toLowerCase().includes(needle) ||
      queue.jobs.some((job) => job.toLowerCase().includes(needle)),
  );
});

const events = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return (data.value?.events ?? []).filter(
    (event) =>
      !needle ||
      event.queue.toLowerCase().includes(needle) ||
      event.job.toLowerCase().includes(needle) ||
      event.status.toLowerCase().includes(needle),
  );
});

function keyOf(queue: { strategy: string; queue: string }): string {
  return `${queue.strategy}::${queue.queue}`;
}

function select(queue: QueueLine): void {
  selectedId.value = selectedId.value === keyOf(queue) ? null : keyOf(queue);
}

const selected = computed(() => queues.value.find((queue) => keyOf(queue) === selectedId.value) ?? null);

const handlers = computed(() =>
  (data.value?.handlers ?? [])
    .filter((handler) => selected.value && keyOf(handler) === keyOf(selected.value))
    .sort((a, b) => a.job.localeCompare(b.job)),
);

const selectedEvents = computed(() =>
  (data.value?.events ?? []).filter((event) => selected.value && keyOf(event) === keyOf(selected.value)).slice(0, 25),
);

watch(queues, (lines) => {
  if (selectedId.value && !lines.some((queue) => keyOf(queue) === selectedId.value)) {
    selectedId.value = null;
  }
});

/** Capability names a transport reports as supported. */
function supported(capabilities: Record<string, boolean>): string[] {
  return Object.entries(capabilities ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}

function statusTone(status: string): string {
  switch (status) {
    case 'ready': {
      return 'green';
    }
    case 'error': {
      return 'red';
    }
    case 'closed': {
      return 'red';
    }
    default: {
      return 'amber';
    }
  }
}

function jobTone(status: string): string {
  switch (status) {
    case 'completed': {
      return 'green';
    }
    case 'failed': {
      return 'red';
    }
    case 'retried': {
      return 'amber';
    }
    default: {
      return 'teal';
    }
  }
}

/** The transport counter worth showing in the ledger, when there is one. */
function waiting(queue: QueueLine): string {
  const value = queue.stats?.waiting;

  return typeof value === 'number' ? String(value) : '--';
}

function time(event: QueueJob): string {
  return new Date(event.at).toLocaleTimeString(undefined, { hour12: false });
}

const meta = computed(() => {
  const report = data.value;

  if (!report?.available) {
    return '';
  }

  const parts = [
    `${report.mounts.length} transport${report.mounts.length === 1 ? '' : 's'}`,
    `${queues.value.length} queue${queues.value.length === 1 ? '' : 's'}`,
    `${report.handlers.length} handler${report.handlers.length === 1 ? '' : 's'}`,
  ];

  return `${parts.join(' · ')}${report.started ? '' : ' · stopped'}`;
});

onMounted(reload);
</script>

<template>
  <PageHeader title="Queues" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter queues…" />
    </template>
  </PageHeader>

  <div class="body" :class="{ open: selected }" :style="{ '--inspector': `${inspectorWidth}px` }">
    <p v-if="error" class="error">{{ error }}</p>

    <div v-else-if="!loading && !data?.available" class="empty">
      <span>The queue module is not in use.</span>
      <span>Bind <code class="mono">QueueManager</code> from <code class="mono">@vercube/queue</code> to see queues here.</span>
    </div>

    <div v-else class="layout">
      <div v-if="data?.mounts.length" class="mounts">
        <span v-for="mount in data.mounts" :key="mount.name" class="mount">
          <span class="mono name">{{ mount.name }}</span>
          <span class="tag">{{ mount.transport }}</span>
          <span class="tag" :class="statusTone(mount.status)">{{ mount.status }}</span>
          <span v-if="mount.error" class="mono faint reason">{{ mount.error }}</span>
          <span v-else class="mono faint reason">{{ supported(mount.capabilities).join(' · ') || 'no native features' }}</span>
        </span>
      </div>

      <div class="ledger queues">
        <table class="table">
          <thead>
            <tr>
              <th>Queue</th>
              <th class="col-jobs">Jobs</th>
              <th class="col-num">Published</th>
              <th class="col-num">Done</th>
              <th class="col-num">Failed</th>
              <th class="col-num">Retried</th>
              <th class="col-num">Active</th>
              <th class="col-num">Waiting</th>
              <th class="col-state">State</th>
            </tr>
          </thead>

          <tbody>
            <tr v-if="queues.length === 0" class="quiet">
              <td colspan="9" class="row-note">No queue matches the filter.</td>
            </tr>

            <tr
              v-for="queue in queues"
              :key="keyOf(queue)"
              class="row"
              :class="{ open: selectedId === keyOf(queue) }"
              tabindex="0"
              role="button"
              :aria-pressed="selectedId === keyOf(queue)"
              @click="select(queue)"
              @keydown.enter.prevent="select(queue)"
              @keydown.space.prevent="select(queue)"
            >
              <td class="mono name">
                {{ queue.queue }}
                <span v-if="data && data.mounts.length > 1" class="tag">{{ queue.strategy }}</span>
              </td>
              <td class="mono faint jobs">{{ queue.jobs.join(', ') || '--' }}</td>
              <td class="num col-num">{{ queue.published }}</td>
              <td class="num col-num">{{ queue.processed }}</td>
              <td class="num col-num" :class="{ bad: queue.failed > 0 }">{{ queue.failed || '--' }}</td>
              <td class="num col-num" :class="{ warn: queue.retried > 0 }">{{ queue.retried || '--' }}</td>
              <td class="num col-num">{{ queue.active || '--' }}</td>
              <td class="num col-num faint">{{ waiting(queue) }}</td>
              <td class="col-state">
                <span class="tag" :class="queue.running ? 'green' : 'amber'">{{ queue.running ? 'consuming' : 'idle' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ledger activity">
        <table class="table">
          <thead>
            <tr>
              <th class="col-time">Time</th>
              <th>Job</th>
              <th class="col-queue">Queue</th>
              <th class="col-attempt">Attempt</th>
              <th class="col-num">Took</th>
              <th class="col-status">Outcome</th>
            </tr>
          </thead>

          <tbody>
            <tr v-if="events.length === 0" class="quiet">
              <td colspan="6" class="row-note">No job has been processed yet.</td>
            </tr>

            <tr v-for="(event, index) in events" :key="`${event.id}-${event.attempt}-${index}`">
              <td class="mono faint col-time">{{ time(event) }}</td>
              <td class="mono name">
                {{ event.job }}
                <span v-if="event.error" class="mono faint reason">{{ event.error }}</span>
              </td>
              <td class="mono faint col-queue">{{ event.queue }}</td>
              <td class="num col-attempt faint">{{ event.attempt }}</td>
              <td class="num col-num faint">{{ formatMs(event.duration) }}</td>
              <td class="col-status">
                <span class="tag" :class="jobTone(event.status)">{{ event.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SplitHandle
      v-if="selected"
      v-model="inspectorWidth"
      :initial="DEFAULT_INSPECTOR_WIDTH"
      :min="300"
      :max="900"
      label="Resize the queue panel"
    />

    <aside v-if="selected" class="inspector scroll">
      <header class="head">
        <div class="title">
          <span class="mono queue">{{ selected.queue }}</span>
          <button class="close" type="button" title="Close the queue panel" @click="selectedId = null">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <p class="meta mono">
          <span>{{ selected.strategy }}</span>
          <span class="faint">{{ selected.running ? 'consuming' : 'idle' }}</span>
        </p>
      </header>

      <section v-if="selected.lastError" class="block">
        <h3 class="label">Last error</h3>
        <p class="reason mono">{{ selected.lastError }}</p>
      </section>

      <section class="block">
        <h3 class="label">Handlers</h3>
        <ul v-if="handlers.length" class="stack">
          <li v-for="handler in handlers" :key="handler.job">
            <span class="mono">{{ handler.job }}</span>
            <span class="mono faint">{{ handler.source }}</span>
            <span class="tag">{{ handler.attempts }} attempt{{ handler.attempts === 1 ? '' : 's' }}</span>
            <span v-if="handler.timeout" class="tag amber">{{ formatMs(handler.timeout) }}</span>
            <span v-if="handler.validated" class="tag green">validated</span>
          </li>
        </ul>
        <p v-else class="none">No handler is registered for this queue.</p>
      </section>

      <section class="block">
        <h3 class="label">Transport counters</h3>
        <ul v-if="selected.stats" class="stack">
          <li v-for="(value, name) in selected.stats" :key="name">
            <span class="mono">{{ name }}</span>
            <span class="num">{{ value }}</span>
          </li>
        </ul>
        <p v-else class="none">This transport keeps no counters.</p>
      </section>

      <section class="block">
        <h3 class="label">Recent jobs</h3>
        <ul v-if="selectedEvents.length" class="stack">
          <li v-for="(event, index) in selectedEvents" :key="`${event.id}-${event.attempt}-${index}`">
            <span class="mono faint">{{ time(event) }}</span>
            <span class="mono">{{ event.job }}</span>
            <span class="tag" :class="jobTone(event.status)">{{ event.status }}</span>
            <span class="num faint">{{ formatMs(event.duration) }}</span>
          </li>
        </ul>
        <p v-else class="none">Nothing has run on this queue yet.</p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.search {
  width: 190px;
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.body.open {
  grid-template-columns: minmax(0, 1fr) var(--inspector);
}

.layout {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.mounts {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 20px;
  min-height: 40px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
  font-size: 12px;
}

.mount {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.queues {
  flex: none;
  max-height: 45%;
  border-bottom: 1px solid var(--edge);
}

.activity {
  flex: 1;
}

.row {
  cursor: pointer;
}

.name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text);
}

.jobs,
.col-queue {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-num {
  width: 78px;
  text-align: right;
}

.col-jobs {
  width: 26%;
}

.col-state,
.col-status {
  width: 108px;
}

.col-time {
  width: 84px;
}

.col-attempt {
  width: 70px;
  text-align: right;
}

.col-queue {
  width: 16%;
}

td.bad {
  color: var(--err);
}

td.warn {
  color: var(--warn);
}

.row.open td {
  background: var(--brand-tint);
}

.row.open td:first-child {
  box-shadow: inset 2px 0 0 var(--brand);
}

.reason {
  font-size: 11.5px;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.inspector {
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 14px 16px 32px;
  border-left: 1px solid var(--edge);
  background: var(--chassis);
}

.head {
  display: grid;
  gap: 4px;
}

.title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.queue {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.meta {
  margin: 0;
  display: flex;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-2);
}

.block {
  display: grid;
  gap: 7px;
}

.stack {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.stack li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.stack li .num {
  margin-left: auto;
}

.none {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.row-note {
  height: auto;
  padding: 10px 12px;
  color: var(--text-3);
  font-size: 12px;
}

.quiet:hover td {
  background: transparent;
}

p.error {
  margin: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 34%, transparent);
  border-radius: var(--radius-sm);
  background: var(--err-tint);
  color: var(--err);
  font-size: 12.5px;
}

.close {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text-3);
  cursor: pointer;
}

.close:hover {
  color: var(--text);
}

@media (max-width: 720px) {
  .mounts {
    display: none;
  }
}
</style>
