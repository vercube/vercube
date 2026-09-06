<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { formatMs, formatUptime, loadLogs, loadMetrics, loadRequests, statusClass, useLoader, useResource } from '../api';
import PageHeader from './PageHeader.vue';
import ParticleField from './ParticleField.vue';
import ProcessBand from './ProcessBand.vue';
import TrafficBand from './TrafficBand.vue';
import VercubeMark from './VercubeMark.vue';
import type { LogEntry, MetricsSample, Overview, RequestRecord } from '../api';

const props = defineProps<{
  live: RequestRecord[];
  liveLogs: LogEntry[];
  liveMetrics: MetricsSample[];
}>();

defineEmits<{ navigate: [tab: string] }>();

const { data, error, loading, reload } = useResource<Overview>('/api/overview');
const recorded = useLoader<RequestRecord[]>(loadRequests);
const recordedLogs = useLoader<LogEntry[]>(loadLogs);

const history = useLoader<MetricsSample[]>(loadMetrics);

const metrics = computed(() => {
  const merged = new Map<number, MetricsSample>();

  for (const sample of [...(history.data.value ?? []), ...props.liveMetrics]) {
    merged.set(sample.at, sample);
  }

  return [...merged.values()].sort((a, b) => a.at - b.at);
});

const recentLogs = computed(() => {
  const merged = new Map<string, LogEntry>();

  for (const entry of [...props.liveLogs, ...(recordedLogs.data.value ?? [])]) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()].sort((a, b) => b.at - a.at || Number(b.id) - Number(a.id)).slice(0, 40);
});

const traffic = computed(() => {
  const merged = new Map<string, RequestRecord>();

  for (const record of [...props.live, ...(recorded.data.value ?? [])]) {
    merged.set(record.id, record);
  }

  return [...merged.values()].sort((a, b) => b.startedAt - a.startedAt);
});

const recent = computed(() => traffic.value.slice(0, 40));

/** Traffic totals recomputed from the merged records, so live events are reflected at once. */
const trafficStats = computed(() => {
  const records = traffic.value;
  const total = records.length;

  if (total === 0) {
    return { total: 0, errors: 0, averageMs: 0, p95Ms: 0 };
  }

  const durations = records.map((record) => record.durationMs).sort((a, b) => a - b);
  const sum = durations.reduce((accumulator, value) => accumulator + value, 0);

  return {
    total,
    errors: records.filter((record) => record.status >= 400).length,
    averageMs: Math.round((sum / total) * 1000) / 1000,
    p95Ms: durations[Math.min(total - 1, Math.floor(total * 0.95))],
  };
});

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString(undefined, { hour12: false });
}

async function reloadAll(): Promise<void> {
  await Promise.all([reload(), recorded.reload(), recordedLogs.reload(), history.reload()]);
}

function scoreTone(score: number): string {
  if (score >= 90) {
    return 'good';
  }

  return score >= 70 ? 'warn' : 'bad';
}

const groups = computed(() => {
  const overview = data.value;

  if (!overview) {
    return [];
  }

  const { counts } = overview;
  const requests = trafficStats.value;

  return [
    {
      label: 'HTTP surface',
      tab: 'routes',
      lead: { value: counts.routes, unit: counts.routes === 1 ? 'route' : 'routes' },
      rows: [
        { label: 'Controllers', value: String(counts.controllers), tone: '' },
        { label: 'Middlewares', value: String(counts.middlewares), tone: '' },
      ],
    },
    {
      label: 'Container',
      tab: 'graph',
      lead: { value: counts.services, unit: counts.services === 1 ? 'binding' : 'bindings' },
      rows: [
        { label: 'Plugins', value: String(counts.plugins), tone: '' },
        { label: 'Cycles', value: String(counts.cycles), tone: counts.cycles > 0 ? 'bad' : 'good' },
      ],
    },
    {
      label: 'Traffic',
      tab: 'requests',
      lead: { value: requests.total, unit: requests.total === 1 ? 'request' : 'requests' },
      rows: [
        { label: 'Errors', value: String(requests.errors), tone: requests.errors > 0 ? 'bad' : 'good' },
        { label: 'p95', value: requests.total ? formatMs(requests.p95Ms) : '--', tone: '' },
      ],
    },
    {
      label: 'Health',
      tab: 'audit',
      lead: { value: overview.score, unit: '/ 100' },
      tone: scoreTone(overview.score),
      rows: [
        { label: 'Findings', value: String(counts.issues), tone: counts.issues > 0 ? 'warn' : 'good' },
        { label: 'Failed', value: String(requests.errors), tone: requests.errors > 0 ? 'bad' : 'good' },
      ],
    },
  ];
});

const extensions = computed(() => {
  const overview = data.value;

  if (!overview) {
    return [];
  }

  return [
    { label: 'Plugins', value: overview.plugins.map((plugin) => plugin.name).join(', ') || '--' },
    { label: 'Middlewares', value: overview.globalMiddlewares.join(', ') || '--' },
  ];
});

const mode = computed(() => {
  const overview = data.value;

  if (!overview) {
    return null;
  }

  if (overview.production) {
    return 'production';
  }

  return overview.dev ? 'development' : 'unknown mode';
});

const meta = computed(() => {
  const overview = data.value;
  return overview ? `${overview.runtime.name} ${overview.runtime.version}` : '';
});

onMounted(reloadAll);
</script>

<template>
  <PageHeader title="Overview" :meta="meta" :loading="loading" @reload="reloadAll" />

  <div class="scroll page">
    <p v-if="error" class="error">{{ error }}</p>

    <section class="masthead rise" :style="{ '--i': 0 }">
      <ParticleField class="particles" />
      <div class="veil" />

      <div class="content">
        <span class="eyebrow slug">Inspecting</span>

        <div class="name">
          <VercubeMark class="mark" />
          <h2 class="display">{{ data?.name ?? 'Vercube' }}</h2>
          <span v-if="data?.version" class="tag">v{{ data.version }}</span>
          <span v-if="mode" class="tag" :class="data?.production ? 'amber' : 'accent'">{{ mode }}</span>
        </div>

        <dl v-if="data" class="facts">
          <div>
            <dt>Runtime</dt>
            <dd class="mono">{{ data.runtime.name }} {{ data.runtime.version }}</dd>
          </div>
          <div>
            <dt>Uptime</dt>
            <dd class="mono">{{ formatUptime(data.uptime) }}</dd>
          </div>
          <div>
            <dt>Bootstrap</dt>
            <dd class="mono">{{ formatMs(data.bootstrapMs) }}</dd>
          </div>
          <div>
            <dt>Average latency</dt>
            <dd class="mono">{{ trafficStats.total ? formatMs(trafficStats.averageMs) : '--' }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <template v-if="data">
      <section class="strip">
        <button v-for="group in groups" :key="group.label" class="cell" type="button" @click="$emit('navigate', group.tab)">
          <span class="label">
            {{ group.label }}
            <svg viewBox="0 0 24 24" class="go" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </span>

          <span class="body">
            <span class="lead">
              <strong class="num" :class="group.tone">{{ group.lead.value }}</strong>
              <span class="unit">{{ group.lead.unit }}</span>
            </span>

            <span class="rows">
              <span v-for="row in group.rows" :key="row.label" class="row">
                <span class="faint">{{ row.label }}</span>
                <span class="mono" :class="row.tone">{{ row.value }}</span>
              </span>
            </span>
          </span>
        </button>

        <div class="cell static">
          <span class="label">Extensions</span>

          <span class="rows wide">
            <span v-for="entry in extensions" :key="entry.label" class="row">
              <span class="faint">{{ entry.label }}</span>
              <span class="mono names" :title="entry.value">{{ entry.value }}</span>
            </span>
          </span>
        </div>
      </section>

      <TrafficBand :records="traffic" />

      <ProcessBand :samples="metrics" />

      <section class="split">
        <div class="surface feed">
          <div class="surface-head">
            <span class="label">Recent requests</span>
            <button class="btn ghost" type="button" @click="$emit('navigate', 'requests')">Open inspector</button>
          </div>

          <div v-if="recent.length" class="ledger">
            <table class="table">
              <thead>
                <tr>
                  <th class="status">Status</th>
                  <th>Path</th>
                  <th class="right">Took</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in recent" :key="record.id">
                  <td>
                    <span class="status" :class="statusClass(record.status)">{{ record.status || '---' }}</span>
                  </td>

                  <td class="mono path" :title="`${record.method} ${record.path}`">
                    <span class="faint verb">{{ record.method }}</span
                    >{{ record.path }}
                  </td>
                  <td class="mono right">{{ formatMs(record.durationMs) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-else class="empty">
            <span>No requests recorded yet.</span>
            <span>Call an endpoint and it appears here as it happens.</span>
          </div>
        </div>

        <div class="surface feed">
          <div class="surface-head">
            <span class="label">Recent logs</span>
            <button class="btn ghost" type="button" @click="$emit('navigate', 'logs')">Open logs</button>
          </div>

          <div v-if="recentLogs.length" class="ledger">
            <table class="table">
              <thead>
                <tr>
                  <th class="time">Time</th>
                  <th class="level">Level</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in recentLogs" :key="entry.id">
                  <td class="mono faint time">{{ formatTime(entry.at) }}</td>
                  <td>
                    <span class="level" :class="entry.level">{{ entry.level }}</span>
                  </td>
                  <td class="path" :title="entry.message">{{ entry.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-else class="empty">
            <span>Nothing logged yet.</span>
            <span>Lines written through the Logger service land here.</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
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

.masthead {
  position: relative;
  flex: none;
  overflow: hidden;
  height: 172px;
  display: flex;
  align-items: flex-end;
  border-bottom: 1px solid var(--edge);
  background: #060608;
}

.particles {
  mask-image: radial-gradient(ellipse 78% 96% at 62% 42%, #000 34%, transparent 100%);
}

.veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(6, 6, 8, 0.94) 8%, rgba(6, 6, 8, 0.6) 44%, transparent 78%),
    linear-gradient(0deg, rgba(6, 6, 8, 0.7), transparent 55%);
}

.content {
  position: relative;
  padding: 16px 20px;
  width: 100%;
}

.name {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 7px;
}

.mark {
  width: 19px;
  height: 22px;
  flex: none;
}

.name h2 {
  font-size: 25px;
  line-height: 1.1;
  color: #ffffff;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 28px;
  margin: 14px 0 0;
}

.facts dt {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
}

.facts dd {
  margin: 2px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
}

:root[data-theme='light'] .masthead .eyebrow {
  color: rgba(255, 255, 255, 0.5);
}

:root[data-theme='light'] .masthead .tag {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.85);
}

:root[data-theme='light'] .masthead .accent {
  background: rgba(187, 79, 255, 0.22);
  border-color: rgba(187, 79, 255, 0.5);
  color: #e9c9ff;
}

.strip {
  flex: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 0.8fr) minmax(0, 1.3fr);
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
}

.cell {
  display: grid;
  gap: 10px;
  padding: 12px 16px 14px;
  text-align: left;
  transition: background 0.12s ease;
}

.cell + .cell {
  border-left: 1px solid var(--edge);
}

.cell:hover {
  background: var(--panel-head);
}

.cell.static,
.cell.static:hover {
  background: transparent;
  cursor: default;
}

.label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}

.go {
  width: 12px;
  height: 12px;
  color: var(--text-3);
  transition: transform 0.15s ease;
}

.cell:hover .go {
  transform: translateX(2px);
  color: var(--text-2);
}

.cell .body {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.lead {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.lead strong {
  font-size: 28px;
  line-height: 1;
}

.unit {
  font-size: 11.5px;
  color: var(--text-3);
}

.rows {
  display: grid;
  gap: 3px;
  flex: none;
}

.rows.wide {
  flex: 1;
  min-width: 0;
  align-self: flex-end;
}

.names {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: 11.5px;
  min-width: 0;
}

.good {
  color: var(--ok);
}

.bad {
  color: var(--err);
}

.warn {
  color: var(--warn);
}

.split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.feed {
  border-right: 1px solid var(--edge);
}

.status {
  width: 62px;
}

.time {
  width: 74px;
}

.level {
  width: 56px;
}

.right {
  text-align: right;
  width: 72px;
}

.level {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.level.info {
  color: var(--info);
}

.level.warn {
  color: var(--warn);
}

.level.error {
  color: var(--err);
}

.verb {
  margin-right: 7px;
  font-size: 10.5px;
}

.path {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed .empty {
  flex: 1;
  align-content: center;
}

@media (max-width: 980px) {
  .page {
    overflow: auto;
  }

  .strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cell + .cell {
    border-left: none;
    border-top: 1px solid var(--edge);
  }

  .split {
    grid-template-columns: minmax(0, 1fr);
    flex: none;
  }

  .feed {
    border-right: none;
    border-bottom: 1px solid var(--edge);
    max-height: 420px;
  }
}

@media (max-width: 720px) {
  .facts {
    gap: 4px 20px;
  }

  .name h2 {
    font-size: 21px;
  }
}
</style>
