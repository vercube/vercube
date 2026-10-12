<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { formatMs, runScheduledJob, useIntrospection } from '../api';
import { useInspectorWidth } from '../inspector';
import PageHeader from './PageHeader.vue';
import SplitHandle from './SplitHandle.vue';
import type { ScheduledJob, ScheduledRun, ScheduledRunResult, SchedulerView } from '../api';

/**
 * How often the ledger refreshes while the panel is open. Runs are traced by
 * the scheduler and show up in Requests as `scheduler.run` spans; this panel is
 * the structural view, so a slow refresh is enough. Every refresh also reads the
 * cluster state from the store, which is one more reason not to go faster.
 */
const REFRESH_MS = 2000;

const { data, error, loading, reload } = useIntrospection<SchedulerView>('scheduler');

const query = ref('');

/** Only one of the two is ever set: the inspector shows a job or a single run. */
const selectedJob = ref<string | null>(null);
const selectedRun = ref<ScheduledRun | null>(null);

const DEFAULT_INSPECTOR_WIDTH = 420;

const inspectorWidth = useInspectorWidth('scheduler-inspector', DEFAULT_INSPECTOR_WIDTH);

/** Ticks once a second, so relative times move between refreshes. */
const now = ref(Date.now());

/** Jobs match on their name, their handler or their schedule. */
const jobs = computed<ScheduledJob[]>(() => {
  const needle = query.value.trim().toLowerCase();

  return (data.value?.jobs ?? []).filter(
    (job) =>
      !needle ||
      job.name.toLowerCase().includes(needle) ||
      job.source.toLowerCase().includes(needle) ||
      job.schedule.toLowerCase().includes(needle),
  );
});

const journal = computed<ScheduledRun[]>(() => data.value?.events ?? []);

const events = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return journal.value.filter(
    (event) =>
      !needle ||
      event.name.toLowerCase().includes(needle) ||
      event.outcome.includes(needle) ||
      event.trigger.includes(needle) ||
      (event.error?.message ?? '').toLowerCase().includes(needle),
  );
});

const job = computed(() => jobs.value.find((entry) => entry.name === selectedJob.value) ?? null);

const open = computed(() => Boolean(job.value || selectedRun.value));

const jobEvents = computed(() => journal.value.filter((event) => job.value && event.name === job.value.name).slice(0, 25));

function runKey(event: ScheduledRun, index: number): string {
  return `${event.at}-${event.occurrenceId}-${index}`;
}

function selectJob(entry: ScheduledJob): void {
  selectedRun.value = null;
  selectedJob.value = selectedJob.value === entry.name ? null : entry.name;
}

function selectRun(event: ScheduledRun): void {
  selectedJob.value = null;
  selectedRun.value = selectedRun.value === event ? null : event;
}

function closeInspector(): void {
  selectedJob.value = null;
  selectedRun.value = null;
}

watch(jobs, (list) => {
  if (selectedJob.value && !list.some((entry) => entry.name === selectedJob.value)) {
    selectedJob.value = null;
  }
});

const running = ref(false);
const runResult = ref<ScheduledRunResult | null>(null);

// a result belongs to the job it was run for
watch(selectedJob, () => {
  runResult.value = null;
});

/** Runs the open job now, through the scheduler's own pipeline. */
async function runNow(): Promise<void> {
  const entry = job.value;

  if (!entry || running.value) {
    return;
  }

  const requested = entry.name;

  running.value = true;

  try {
    const result = await runScheduledJob(requested);

    if (selectedJob.value === requested) {
      runResult.value = result;
    }
  } catch (error) {
    if (selectedJob.value === requested) {
      runResult.value = { error: error instanceof Error ? error.message : String(error) };
    }
  } finally {
    running.value = false;
    void reload();
  }
}

function outcomeTone(outcome: string): string {
  switch (outcome) {
    case 'completed': {
      return 'green';
    }
    case 'failed':
    case 'aborted': {
      return 'red';
    }
    case 'missed':
    case 'running': {
      return 'amber';
    }
    default: {
      return 'teal';
    }
  }
}

function statusTone(status: string): string {
  switch (status) {
    case 'ready': {
      return 'green';
    }
    case 'error': {
      return 'red';
    }
    default: {
      return 'amber';
    }
  }
}

function target(entry: ScheduledJob): string {
  return entry.target === 'inline' ? 'inline' : `queue ${entry.target.queue}`;
}

/** How far away an instant is, coarse enough to read at a glance. */
function relative(at: number): string {
  const seconds = Math.round((at - now.value) / 1000);
  const span = Math.abs(seconds);
  let text: string;

  if (span < 60) {
    text = `${span}s`;
  } else if (span < 3600) {
    text = `${Math.floor(span / 60)}m ${span % 60}s`;
  } else if (span < 86_400) {
    text = `${Math.floor(span / 3600)}h ${Math.floor((span % 3600) / 60)}m`;
  } else {
    text = `${Math.floor(span / 86_400)}d ${Math.floor((span % 86_400) / 3600)}h`;
  }

  return seconds >= 0 ? `in ${text}` : `${text} ago`;
}

function nextRun(entry: ScheduledJob): string {
  if (entry.paused) {
    return 'paused';
  }

  if (entry.external) {
    return 'external only';
  }

  return entry.nextRun ? relative(new Date(entry.nextRun).getTime()) : '--';
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour12: false });
}

function stamp(at: number | string): string {
  return new Date(at).toLocaleString(undefined, { hour12: false });
}

const meta = computed(() => {
  const report = data.value;

  if (!report?.available) {
    return '';
  }

  const parts = [`${report.jobs.length} job${report.jobs.length === 1 ? '' : 's'}`, report.instanceId];

  return `${parts.join(' · ')}${report.started ? '' : ' · stopped'}`;
});

let refresh: ReturnType<typeof setInterval> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void reload();
  refresh = setInterval(() => void reload(), REFRESH_MS);
  clock = setInterval(() => (now.value = Date.now()), 1000);
});

onUnmounted(() => {
  for (const timer of [refresh, clock]) {
    if (timer) {
      clearInterval(timer);
    }
  }

  refresh = null;
  clock = null;
});
</script>

<template>
  <PageHeader title="Scheduler" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter jobs and runs…" />
    </template>
  </PageHeader>

  <div class="body" :class="{ open }" :style="{ '--inspector': `${inspectorWidth}px` }">
    <p v-if="error" class="error">{{ error }}</p>

    <div v-else-if="!loading && !data?.available" class="empty">
      <span>The scheduler is not in use.</span>
      <span
        >Add <code class="mono">SchedulerPlugin</code> from <code class="mono">@vercube/scheduler</code> to see jobs here.</span
      >
    </div>

    <div v-else class="layout">
      <div class="strip">
        <span v-if="data?.store" class="item">
          <span class="label">Store</span>
          <span class="mono name">{{ data.store.name }}</span>
          <span class="tag" :class="data.store.distributed ? 'green' : 'amber'">
            {{ data.store.distributed ? 'distributed' : 'this process only' }}
          </span>
          <span class="tag" :class="statusTone(data.store.status)">{{ data.store.status }}</span>
          <span v-if="data.store.error" class="mono faint reason">{{ data.store.error }}</span>
        </span>
        <span v-else class="item">
          <span class="label">Store</span>
          <span class="mono faint">none, instance jobs only</span>
        </span>
        <span v-if="data?.stateError" class="item">
          <span class="label">Cluster state</span>
          <span class="mono reason bad">{{ data.stateError }}</span>
        </span>
      </div>

      <div class="ledger jobs">
        <table class="table">
          <thead>
            <tr>
              <th>Job</th>
              <th class="col-schedule">Schedule</th>
              <th class="col-scope">Scope</th>
              <th class="col-target">Target</th>
              <th class="col-next">Next run</th>
              <th class="col-last">Last run</th>
              <th class="col-toggle" aria-label="Details" />
            </tr>
          </thead>

          <tbody>
            <tr v-if="jobs.length === 0" class="quiet">
              <td colspan="7" class="row-note">No job matches the filter.</td>
            </tr>

            <tr
              v-for="entry in jobs"
              :key="entry.name"
              class="row"
              :class="{ open: selectedJob === entry.name }"
              tabindex="0"
              role="button"
              :aria-pressed="selectedJob === entry.name"
              @click="selectJob(entry)"
              @keydown.enter.prevent="selectJob(entry)"
              @keydown.space.prevent="selectJob(entry)"
            >
              <td class="mono name">
                {{ entry.name }}
                <span v-if="entry.running" class="tag teal">running</span>
              </td>
              <td class="mono faint col-schedule">
                {{ entry.schedule }}<span v-if="entry.timezone"> · {{ entry.timezone }}</span>
              </td>
              <td class="col-scope">{{ entry.scope }}</td>
              <td class="mono faint col-target">{{ target(entry) }}</td>
              <td class="mono col-next" :class="{ faint: entry.paused || entry.external }">{{ nextRun(entry) }}</td>
              <td class="mono col-last">
                <template v-if="entry.cluster">
                  <span :class="`tone-${outcomeTone(entry.cluster.lastOutcome)}`">{{ entry.cluster.lastOutcome }}</span>
                  <span class="faint"> · {{ relative(entry.cluster.lastStartedAt) }}</span>
                </template>
                <template v-else-if="entry.lastRun">
                  <span :class="`tone-${outcomeTone(entry.lastRun.outcome)}`">{{ entry.lastRun.outcome }}</span>
                  <span class="faint"> · {{ relative(entry.lastRun.at) }}</span>
                </template>
                <span v-else class="faint">--</span>
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

      <div class="ledger activity">
        <table class="table">
          <thead>
            <tr>
              <th class="col-time">Time</th>
              <th>Job</th>
              <th class="col-trigger">Trigger</th>
              <th class="col-num">Took</th>
              <th class="col-status">Outcome</th>
              <th class="col-toggle" aria-label="Details" />
            </tr>
          </thead>

          <tbody>
            <tr v-if="events.length === 0" class="quiet">
              <td colspan="6" class="row-note">Nothing has run on this replica yet. Runs show up here as they finish.</td>
            </tr>

            <tr
              v-for="(event, index) in events"
              :key="runKey(event, index)"
              class="row"
              :class="{ open: selectedRun === event }"
              tabindex="0"
              role="button"
              :aria-pressed="selectedRun === event"
              @click="selectRun(event)"
              @keydown.enter.prevent="selectRun(event)"
              @keydown.space.prevent="selectRun(event)"
            >
              <td class="mono faint col-time">{{ time(event.at) }}</td>
              <td class="mono name">
                {{ event.name }}
                <span v-if="event.error" class="mono faint reason">{{ event.error.message }}</span>
              </td>
              <td class="mono faint col-trigger">{{ event.trigger }}</td>
              <td class="num col-num faint">{{ event.attempts ? formatMs(event.durationMs) : '--' }}</td>
              <td class="col-status">
                <span class="tag" :class="outcomeTone(event.outcome)">{{ event.outcome }}</span>
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
      label="Resize the scheduler panel"
    />

    <aside v-if="open" class="inspector scroll">
      <template v-if="job">
        <header class="head">
          <div class="title">
            <span class="mono subject">{{ job.name }}</span>
            <button class="close" type="button" title="Close the job panel" @click="closeInspector">
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p class="meta mono">
            <span>{{ job.source }}</span>
          </p>
        </header>

        <section class="block">
          <div class="heading">
            <h3 class="label">Run now</h3>
            <button class="btn" type="button" :disabled="running" @click="runNow()">{{ running ? 'Running…' : 'Run' }}</button>
          </div>
          <p class="none">Goes through the same claim as the timer, so another replica holding the job skips it here.</p>
          <p v-if="runResult?.outcome" class="mono result">
            <span :class="`tone-${outcomeTone(runResult.outcome)}`">{{ runResult.outcome }}</span>
            <span class="faint">{{ runResult.occurrenceId }}</span>
            <span v-if="runResult.durationMs !== undefined" class="faint">{{ formatMs(runResult.durationMs) }}</span>
          </p>
          <p v-if="runResult?.error" class="reason mono bad">{{ runResult.error }}</p>
        </section>

        <section class="block">
          <h3 class="label">Schedule</h3>
          <ul class="stack">
            <li>
              <span class="mono faint">{{ job.kind }}</span>
              <span class="mono value">{{ job.schedule }}</span>
            </li>
            <li v-if="job.timezone">
              <span class="mono faint">time zone</span>
              <span class="mono value">{{ job.timezone }}</span>
            </li>
            <li>
              <span class="mono faint">next run</span>
              <span class="mono value">{{ job.nextRun ? stamp(job.nextRun) : nextRun(job) }}</span>
            </li>
          </ul>
        </section>

        <section class="block">
          <h3 class="label">Policies</h3>
          <ul class="stack">
            <li>
              <span class="mono faint">scope</span>
              <span class="mono value">{{ job.scope }}</span>
            </li>
            <li>
              <span class="mono faint">target</span>
              <span class="mono value">{{ target(job) }}</span>
            </li>
            <li>
              <span class="mono faint">overlap</span>
              <span class="mono value">{{ job.overlap }}</span>
            </li>
            <li>
              <span class="mono faint">misfire</span>
              <span class="mono value">{{ job.misfire }}</span>
            </li>
          </ul>
        </section>

        <section class="block">
          <h3 class="label">Last run in the cluster</h3>
          <ul v-if="job.cluster" class="stack">
            <li>
              <span class="mono faint">outcome</span>
              <span class="mono value" :class="`tone-${outcomeTone(job.cluster.lastOutcome)}`">{{
                job.cluster.lastOutcome
              }}</span>
            </li>
            <li>
              <span class="mono faint">replica</span>
              <span class="mono value">{{ job.cluster.lastInstance }}</span>
            </li>
            <li>
              <span class="mono faint">occurrence</span>
              <span class="mono value">{{ stamp(job.cluster.lastScheduledAt) }}</span>
            </li>
            <li>
              <span class="mono faint">started</span>
              <span class="mono value">{{ stamp(job.cluster.lastStartedAt) }}</span>
            </li>
            <li v-if="job.cluster.lastFinishedAt">
              <span class="mono faint">took</span>
              <span class="mono value">{{ formatMs(job.cluster.lastFinishedAt - job.cluster.lastStartedAt) }}</span>
            </li>
          </ul>
          <p v-else-if="job.scope === 'instance'" class="none">Instance jobs run on every replica and keep no shared state.</p>
          <p v-else class="none">The store has no record of this job yet.</p>
          <p v-if="job.cluster?.lastError" class="reason mono bad">{{ job.cluster.lastError }}</p>
        </section>

        <section class="block">
          <h3 class="label">Recent runs here</h3>
          <ul v-if="jobEvents.length" class="stack">
            <li v-for="(event, index) in jobEvents" :key="runKey(event, index)" class="clickable" @click="selectRun(event)">
              <span class="mono faint">{{ time(event.at) }}</span>
              <span class="mono">{{ event.trigger }}</span>
              <span class="tag" :class="outcomeTone(event.outcome)">{{ event.outcome }}</span>
              <span class="num faint">{{ event.attempts ? formatMs(event.durationMs) : '--' }}</span>
            </li>
          </ul>
          <p v-else class="none">This replica has not run this job yet.</p>
        </section>
      </template>

      <template v-else-if="selectedRun">
        <header class="head">
          <div class="title">
            <span class="tag" :class="outcomeTone(selectedRun.outcome)">{{ selectedRun.outcome }}</span>
            <span class="mono subject">{{ selectedRun.name }}</span>
            <button class="close" type="button" title="Close the run panel" @click="closeInspector">
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p class="meta mono">
            <span>{{ selectedRun.trigger }}</span>
            <span v-if="selectedRun.attempts" class="faint">
              {{ selectedRun.attempts }} attempt{{ selectedRun.attempts === 1 ? '' : 's' }}
            </span>
            <span v-if="selectedRun.attempts" class="faint">{{ formatMs(selectedRun.durationMs) }}</span>
          </p>
        </header>

        <section class="block">
          <h3 class="label">Run</h3>
          <ul class="stack">
            <li>
              <span class="mono faint">occurrence</span>
              <span class="mono value">{{ selectedRun.occurrenceId }}</span>
            </li>
            <li>
              <span class="mono faint">scheduled</span>
              <span class="mono value">{{ stamp(selectedRun.scheduledAt) }}</span>
            </li>
            <li>
              <span class="mono faint">recorded</span>
              <span class="mono value">{{ stamp(selectedRun.at) }}</span>
            </li>
            <li>
              <span class="mono faint">replica</span>
              <span class="mono value">{{ selectedRun.instanceId }}</span>
            </li>
          </ul>
        </section>

        <section v-if="selectedRun.error" class="block">
          <h3 class="label">Error</h3>
          <p class="failure mono">
            <span class="err">{{ selectedRun.error.name }}</span>
            {{ selectedRun.error.message }}
          </p>
          <div v-if="selectedRun.error.operation" class="tags">
            <span class="tag">{{ selectedRun.error.operation }}</span>
          </div>
        </section>

        <p v-if="selectedRun.outcome === 'skipped-claimed'" class="none">Another replica claimed this occurrence and ran it.</p>
        <p v-else-if="selectedRun.outcome === 'skipped-overlap'" class="none">The previous run of this job was still going.</p>
        <p v-else-if="selectedRun.outcome === 'missed'" class="none">
          The timer fired past its misfire grace, and the misfire policy skips late occurrences.
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

.strip {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 24px;
  min-height: 40px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
  font-size: 12px;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.jobs {
  flex: none;
  max-height: 50%;
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

.col-schedule,
.col-target {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-schedule {
  width: 22%;
}

.col-target {
  width: 13%;
}

.col-scope {
  width: 76px;
}

.col-next {
  width: 118px;
}

.col-last {
  width: 200px;
  white-space: nowrap;
}

td.col-scope {
  color: var(--text-2);
}

td.col-scope,
td.col-next,
td.col-last {
  font-size: 12px;
}

.col-num {
  width: 78px;
  text-align: right;
}

.col-status {
  width: 128px;
}

.col-time {
  width: 84px;
}

.col-trigger {
  width: 90px;
}

.col-toggle {
  width: 30px;
}

.tone-green {
  color: var(--ok);
}

.tone-red,
.bad {
  color: var(--err);
}

.tone-amber {
  color: var(--warn);
}

.tone-teal {
  color: var(--text-2);
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

.reason.bad {
  color: var(--err);
  white-space: normal;
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

.result {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
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
  .strip {
    display: none;
  }
}
</style>
