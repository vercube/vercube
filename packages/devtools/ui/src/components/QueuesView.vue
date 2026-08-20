<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, formatMs, useResource } from '../api';
import { useInspectorWidth } from '../inspector';
import PageHeader from './PageHeader.vue';
import SplitHandle from './SplitHandle.vue';
import type { QueueJob, QueueLine, QueueMessages, QueueMetrics, QueueView } from '../api';

const props = defineProps<{
  /** Jobs pushed over the stream since the page was opened, newest first. */
  live?: QueueJob[];
  /** Counters as of the last batch. */
  liveMetrics?: QueueMetrics[];
  /** Jobs the stream left out because a batch was full. */
  dropped?: number;
}>();

const { data, error, loading, reload } = useResource<QueueView>('/api/queues');

const query = ref('');

/** Only one of the two is ever set: the inspector shows a queue or a single job. */
const selectedQueue = ref<string | null>(null);
const selectedJob = ref<QueueJob | null>(null);

const DEFAULT_INSPECTOR_WIDTH = 420;

const inspectorWidth = useInspectorWidth('queues-inspector', DEFAULT_INSPECTOR_WIDTH);

/**
 * The fetched queues with the counters of the last streamed batch applied, so
 * the ledger keeps up without refetching. Transport counters stay as fetched:
 * reading those costs a broker round trip.
 */
const lines = computed<QueueLine[]>(() => {
  const fetched = data.value?.queues ?? [];
  const live = new Map((props.liveMetrics ?? []).map((entry) => [`${entry.strategy}::${entry.queue}`, entry]));

  return fetched.map((line) => {
    const fresh = live.get(keyOf(line));

    return fresh ? { ...line, ...fresh } : line;
  });
});

/** Queues match on their own name, their strategy or any job they handle. */
const queues = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return lines.value.filter(
    (queue) =>
      !needle ||
      queue.queue.toLowerCase().includes(needle) ||
      queue.strategy.toLowerCase().includes(needle) ||
      queue.jobs.some((job) => job.toLowerCase().includes(needle)),
  );
});

/** Streamed jobs first, then whatever the last fetch knew, without repeating any. */
const journal = computed<QueueJob[]>(() => {
  const seen = new Set<string>();
  const merged: QueueJob[] = [];

  for (const event of [...(props.live ?? []), ...(data.value?.events ?? [])]) {
    const key = `${event.at}-${event.strategy}-${event.queue}-${event.id}-${event.attempt}-${event.status}`;

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(event);
    }
  }

  return merged;
});

const events = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return journal.value.filter(
    (event) =>
      !needle ||
      event.queue.toLowerCase().includes(needle) ||
      event.job.toLowerCase().includes(needle) ||
      event.status.toLowerCase().includes(needle) ||
      (event.error?.message ?? '').toLowerCase().includes(needle),
  );
});

function keyOf(queue: { strategy: string; queue: string }): string {
  return `${queue.strategy}::${queue.queue}`;
}

function jobKey(event: QueueJob, index: number): string {
  return `${event.at}-${event.id}-${event.attempt}-${index}`;
}

function selectQueue(queue: QueueLine): void {
  selectedJob.value = null;
  selectedQueue.value = selectedQueue.value === keyOf(queue) ? null : keyOf(queue);
}

function selectJob(event: QueueJob): void {
  selectedQueue.value = null;
  selectedJob.value = selectedJob.value === event ? null : event;
}

function closeInspector(): void {
  selectedQueue.value = null;
  selectedJob.value = null;
}

const queue = computed(() => queues.value.find((entry) => keyOf(entry) === selectedQueue.value) ?? null);

const open = computed(() => Boolean(queue.value || selectedJob.value));

const handlers = computed(() =>
  (data.value?.handlers ?? [])
    .filter((handler) => queue.value && keyOf(handler) === keyOf(queue.value))
    .sort((a, b) => a.job.localeCompare(b.job)),
);

const queueEvents = computed(() =>
  journal.value.filter((event) => queue.value && keyOf(event) === keyOf(queue.value)).slice(0, 25),
);

/**
 * A queue nobody fetched yet can show up in a streamed batch. Its counters are
 * there, but its handlers and transport are not, so refetch once it appears.
 */
watch(
  () => props.liveMetrics,
  (metrics) => {
    const known = new Set((data.value?.queues ?? []).map((line) => keyOf(line)));

    if ((metrics ?? []).some((entry) => !known.has(`${entry.strategy}::${entry.queue}`))) {
      void reload();
    }
  },
);

const messages = ref<QueueMessages | null>(null);
const loadingMessages = ref(false);

/** Reads what the open queue is holding. Costs a broker round trip, so it is explicit. */
async function loadMessages(): Promise<void> {
  const line = queue.value;

  if (!line) {
    return;
  }

  loadingMessages.value = true;

  try {
    messages.value = await api<QueueMessages>(
      `/api/queues/messages?queue=${encodeURIComponent(line.queue)}&strategy=${encodeURIComponent(line.strategy)}&limit=25`,
    );
  } catch (error) {
    messages.value = {
      queue: line.queue,
      strategy: line.strategy,
      peekable: true,
      messages: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    loadingMessages.value = false;
  }
}

// a fresh queue means fresh contents, and a queue that cannot be peeked means none
watch(selectedQueue, (name) => {
  messages.value = null;

  if (name && queue.value?.peekable) {
    void loadMessages();
  }
});

watch(queues, (lines) => {
  if (selectedQueue.value && !lines.some((entry) => keyOf(entry) === selectedQueue.value)) {
    selectedQueue.value = null;
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
    case 'error':
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
function waiting(line: QueueLine): string {
  const value = line.stats?.waiting;

  return typeof value === 'number' ? String(value) : '--';
}

function time(event: QueueJob): string {
  return new Date(event.at).toLocaleTimeString(undefined, { hour12: false });
}

function due(at: number): string {
  const seconds = Math.round((at - Date.now()) / 1000);

  return seconds > 0 ? `in ${seconds}s` : 'due';
}

function stamp(event: QueueJob): string {
  return new Date(event.at).toLocaleString(undefined, { hour12: false });
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

  if (props.dropped) {
    parts.push(`${props.dropped} not shown`);
  }

  return `${parts.join(' · ')}${report.started ? '' : ' · stopped'}`;
});

onMounted(reload);
</script>

<template>
  <PageHeader title="Queues" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter queues and jobs…" />
    </template>
  </PageHeader>

  <div class="body" :class="{ open }" :style="{ '--inspector': `${inspectorWidth}px` }">
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
              v-for="line in queues"
              :key="keyOf(line)"
              class="row"
              :class="{ open: selectedQueue === keyOf(line) }"
              tabindex="0"
              role="button"
              :aria-pressed="selectedQueue === keyOf(line)"
              @click="selectQueue(line)"
              @keydown.enter.prevent="selectQueue(line)"
              @keydown.space.prevent="selectQueue(line)"
            >
              <td class="mono name">
                {{ line.queue }}
                <span v-if="data && data.mounts.length > 1" class="tag">{{ line.strategy }}</span>
              </td>
              <td class="mono faint jobs">{{ line.jobs.join(', ') || '--' }}</td>
              <td class="num col-num">{{ line.published }}</td>
              <td class="num col-num">{{ line.processed }}</td>
              <td class="num col-num" :class="{ bad: line.failed > 0 }">{{ line.failed || '--' }}</td>
              <td class="num col-num" :class="{ warn: line.retried > 0 }">{{ line.retried || '--' }}</td>
              <td class="num col-num">{{ line.active || '--' }}</td>
              <td class="num col-num faint">{{ waiting(line) }}</td>
              <td class="col-state">
                <span class="tag" :class="line.running ? 'green' : 'amber'">{{ line.running ? 'consuming' : 'idle' }}</span>
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
              <th class="col-toggle" aria-label="Details" />
            </tr>
          </thead>

          <tbody>
            <tr v-if="events.length === 0" class="quiet">
              <td colspan="7" class="row-note">Nothing has run yet. Jobs show up here as they finish.</td>
            </tr>

            <tr
              v-for="(event, index) in events"
              :key="jobKey(event, index)"
              class="row"
              :class="{ open: selectedJob === event }"
              tabindex="0"
              role="button"
              :aria-pressed="selectedJob === event"
              @click="selectJob(event)"
              @keydown.enter.prevent="selectJob(event)"
              @keydown.space.prevent="selectJob(event)"
            >
              <td class="mono faint col-time">{{ time(event) }}</td>
              <td class="mono name">
                {{ event.job }}
                <span v-if="event.error" class="mono faint reason">{{ event.error.message }}</span>
              </td>
              <td class="mono faint col-queue">{{ event.queue }}</td>
              <td class="num col-attempt faint">{{ event.attempt }}</td>
              <td class="num col-num faint">{{ formatMs(event.duration) }}</td>
              <td class="col-status">
                <span class="tag" :class="jobTone(event.status)">{{ event.status }}</span>
              </td>
              <td class="col-toggle">
                <svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SplitHandle
      v-if="open"
      v-model="inspectorWidth"
      :initial="DEFAULT_INSPECTOR_WIDTH"
      :min="300"
      :max="900"
      label="Resize the queue panel"
    />

    <aside v-if="open" class="inspector scroll">
      <template v-if="queue">
        <header class="head">
          <div class="title">
            <span class="mono subject">{{ queue.queue }}</span>
            <button class="close" type="button" title="Close the queue panel" @click="closeInspector">
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p class="meta mono">
            <span>{{ queue.strategy }}</span>
            <span class="faint">{{ queue.running ? 'consuming' : 'idle' }}</span>
          </p>
        </header>

        <section v-if="queue.lastError" class="block">
          <h3 class="label">Last error</h3>
          <p class="reason mono">{{ queue.lastError }}</p>
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
          <ul v-if="queue.stats" class="stack">
            <li v-for="(value, name) in queue.stats" :key="name">
              <span class="mono">{{ name }}</span>
              <span class="num">{{ value }}</span>
            </li>
          </ul>
          <p v-else class="none">This transport keeps no counters.</p>
        </section>

        <section class="block">
          <div class="heading">
            <h3 class="label">Messages</h3>
            <button v-if="queue.peekable" class="btn ghost" type="button" :disabled="loadingMessages" @click="loadMessages()">
              {{ loadingMessages ? 'Reading…' : 'Refresh' }}
            </button>
          </div>

          <p v-if="!queue.peekable" class="none">This transport cannot show a queue without consuming it, so nothing is read.</p>
          <p v-else-if="messages?.error" class="reason mono">{{ messages.error }}</p>
          <ul v-else-if="messages?.messages.length" class="stack">
            <li v-for="message in messages.messages" :key="`${message.state}-${message.id}`">
              <span class="tag" :class="message.state === 'failed' ? 'red' : 'teal'">{{ message.state }}</span>
              <span class="mono">{{ message.job }}</span>
              <span class="mono faint">{{ message.id }}</span>
              <span v-if="message.availableAt" class="mono faint value">{{ due(message.availableAt) }}</span>
            </li>
          </ul>
          <p v-else-if="loadingMessages" class="none">Reading the queue…</p>
          <p v-else class="none">This queue is holding nothing.</p>
        </section>

        <section class="block">
          <h3 class="label">Recent jobs</h3>
          <ul v-if="queueEvents.length" class="stack">
            <li v-for="(event, index) in queueEvents" :key="jobKey(event, index)" class="clickable" @click="selectJob(event)">
              <span class="mono faint">{{ time(event) }}</span>
              <span class="mono">{{ event.job }}</span>
              <span class="tag" :class="jobTone(event.status)">{{ event.status }}</span>
              <span class="num faint">{{ formatMs(event.duration) }}</span>
            </li>
          </ul>
          <p v-else class="none">Nothing has run on this queue yet.</p>
        </section>
      </template>

      <template v-else-if="selectedJob">
        <header class="head">
          <div class="title">
            <span class="tag" :class="jobTone(selectedJob.status)">{{ selectedJob.status }}</span>
            <span class="mono subject">{{ selectedJob.job }}</span>
            <button class="close" type="button" title="Close the job panel" @click="closeInspector">
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p class="meta mono">
            <span>{{ selectedJob.queue }}</span>
            <span class="faint">attempt {{ selectedJob.attempt }}</span>
            <span class="faint">{{ formatMs(selectedJob.duration) }}</span>
          </p>
        </header>

        <section class="block">
          <h3 class="label">Job</h3>
          <ul class="stack">
            <li>
              <span class="mono faint">id</span>
              <span class="mono value">{{ selectedJob.id }}</span>
            </li>
            <li>
              <span class="mono faint">at</span>
              <span class="mono value">{{ stamp(selectedJob) }}</span>
            </li>
            <li>
              <span class="mono faint">strategy</span>
              <span class="mono value">{{ selectedJob.strategy }}</span>
            </li>
            <li v-if="selectedJob.source">
              <span class="mono faint">handler</span>
              <span class="mono value">{{ selectedJob.source }}</span>
            </li>
          </ul>
        </section>

        <section v-if="selectedJob.error" class="block">
          <h3 class="label">Error</h3>
          <p class="failure mono">
            <span class="err">{{ selectedJob.error.name }}</span>
            {{ selectedJob.error.message }}
          </p>
          <div class="tags">
            <span v-if="selectedJob.error.operation" class="tag">{{ selectedJob.error.operation }}</span>
            <span v-if="selectedJob.error.retryable === false" class="tag red">not retryable</span>
            <span v-else-if="selectedJob.error.retryable" class="tag amber">retryable</span>
          </div>
          <pre v-if="selectedJob.error.stack" class="code scroll">{{ selectedJob.error.stack }}</pre>
          <p v-else class="none">This error carried no stack trace.</p>
        </section>

        <section v-if="selectedJob.payload" class="block">
          <h3 class="label">Payload</h3>
          <pre class="code scroll">{{ selectedJob.payload }}</pre>
        </section>

        <section v-if="selectedJob.headers" class="block">
          <h3 class="label">Headers</h3>
          <ul class="stack">
            <li v-for="(value, name) in selectedJob.headers" :key="name">
              <span class="mono faint">{{ name }}</span>
              <span class="mono value">{{ value }}</span>
            </li>
          </ul>
        </section>

        <p v-if="selectedJob.status === 'completed'" class="none">
          A job that completed keeps no payload: there is nothing to diagnose.
        </p>
        <p v-else-if="!selectedJob.payload" class="none">
          No payload was kept for this attempt. It failed before the inspector was opened.
        </p>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.search {
  width: 210px;
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

.col-toggle {
  width: 30px;
}

td.bad {
  color: var(--err);
}

td.warn {
  color: var(--warn);
}

.chevron {
  display: block;
  width: 13px;
  height: 13px;
  color: var(--text-3);
  transition: color 0.12s ease;
}

.row.open .chevron {
  color: var(--brand);
}

.row.open td,
.row.open:hover td {
  background: var(--brand-tint);
}

.row.open td:first-child {
  box-shadow: inset 2px 0 0 var(--brand);
}

.reason {
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.subject {
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

.heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

.stack li.clickable {
  cursor: pointer;
}

.stack li.clickable:hover {
  color: var(--brand);
}

.stack li .num {
  margin-left: auto;
}

.stack li .value {
  margin-left: auto;
  overflow-wrap: anywhere;
  text-align: right;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.failure {
  margin: 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.failure .err {
  color: var(--err);
}

.code {
  margin: 0;
  max-height: 320px;
  padding: 10px 12px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text-2);
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre;
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
