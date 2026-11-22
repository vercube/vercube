<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { formatMs, runHealthChecks, useIntrospection } from '../api';
import PageHeader from './PageHeader.vue';
import type { HealthCheckResult, HealthView } from '../api';

const props = defineProps<{ invalidated?: { id: string; at: number } | null }>();

/** Auto refresh choices, in seconds. `0` is off. */
const INTERVALS = [0, 5, 15, 60];

/** A check that used this share of its timeout is close to failing. */
const SLOW_SHARE = 0.5;

const { data, error, loading, reload } = useIntrospection<HealthView>('health');

const running = ref(false);
const failure = ref<string | null>(null);
const every = ref(readInterval());
const now = ref(Date.now());

interface Row {
  name: string;
  label: string;
  critical: boolean;
  timeout: number;
  result: HealthCheckResult | undefined;
  slow: boolean;
}

function readInterval(): number {
  const stored = Number(globalThis.localStorage?.getItem('vercube-devtools-health-refresh'));

  return INTERVALS.find((seconds) => seconds === stored) ?? 0;
}

/** `queue:orders` belongs to `queue`; a check without a prefix is the application's own. */
function moduleOf(name: string): string {
  const index = name.indexOf(':');

  return index > 0 ? name.slice(0, index) : 'application';
}

const groups = computed(() => {
  const report = data.value?.report;
  const byModule = new Map<string, Row[]>();

  for (const check of data.value?.checks ?? []) {
    const result = report?.checks[check.name];
    const module = moduleOf(check.name);
    const rows = byModule.get(module) ?? [];

    rows.push({
      name: check.name,
      label: module === 'application' ? check.name : check.name.slice(module.length + 1),
      critical: check.critical,
      timeout: check.timeout,
      result,
      slow: result?.status === 'ok' && result.duration >= check.timeout * SLOW_SHARE,
    });
    byModule.set(module, rows);
  }

  return [...byModule.entries()].map(([module, rows]) => ({
    module,
    rows,
    down: rows.filter((row) => row.result?.status === 'down').length,
  }));
});

const failing = computed(() => groups.value.reduce((total, group) => total + group.down, 0));

/** Liveness only asks whether the process answers, which it just did. */
const liveness = computed(() => (data.value?.state === 'closed' ? 'down' : 'ok'));

/** What the readiness probe answers: not ready outside `ready`, then the report. */
const readiness = computed(() => {
  const health = data.value;

  if (!health) {
    return { text: '--', tone: '' };
  }

  if (health.state !== 'ready') {
    return { text: 'not ready', tone: health.state === 'starting' ? 'warn' : 'bad' };
  }

  if (health.checks.length === 0) {
    return { text: 'ok', tone: 'good' };
  }

  switch (health.report?.status) {
    case 'ok': {
      return { text: 'ok', tone: 'good' };
    }
    case 'degraded': {
      return { text: 'degraded', tone: 'warn' };
    }
    case 'down': {
      return { text: 'down', tone: 'bad' };
    }
    default: {
      return { text: 'not run yet', tone: '' };
    }
  }
});

const stateTone = computed(() => {
  switch (data.value?.state) {
    case 'ready': {
      return 'good';
    }
    case 'starting': {
      return 'warn';
    }
    case undefined: {
      return '';
    }
    default: {
      return 'bad';
    }
  }
});

const lastRun = computed(() => {
  const at = data.value?.report?.timestamp;

  if (!at) {
    return 'never';
  }

  const seconds = Math.max(0, Math.round((now.value - at) / 1000));

  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
});

/** What a probe answers with: `full` is only ever given to a request that carries the token. */
function detailsLevel(details: string, token: boolean): string {
  const anonymous = details === 'full' ? 'summary' : details;

  return token ? `${anonymous}, full with the token` : anonymous;
}

function toggle(on: boolean): string {
  return on ? 'on' : 'off';
}

const settings = computed(() => {
  const config = data.value?.config;

  if (!config) {
    return [];
  }

  const signals = Array.isArray(config.handleSignals) ? config.handleSignals.join(', ') : toggle(config.handleSignals);

  return [
    { label: 'Probe routes', value: config.routes ? 'on' : 'off, health is not set' },
    { label: 'live', value: config.endpoints.live ?? '--' },
    { label: 'ready', value: config.endpoints.ready ?? '--' },
    { label: 'startup', value: config.endpoints.startup ?? '--' },
    { label: 'details', value: detailsLevel(config.details, config.token) },
    { label: 'timeout', value: `${config.timeout} ms` },
    { label: 'cacheTtl', value: `${config.cacheTtl} ms` },
    { label: 'drainDelay', value: `${config.drainDelay} ms` },
    { label: 'handleSignals', value: signals },
  ];
});

const meta = computed(() => {
  const health = data.value;

  if (!health) {
    return '';
  }

  const count = health.checks.length;
  const parts = [health.state, `${count} check${count === 1 ? '' : 's'}`];

  if (failing.value > 0) {
    parts.push(`${failing.value} failing`);
  }

  return parts.join(' · ');
});

function statusTone(row: Row): string {
  if (!row.result) {
    return '';
  }

  if (row.result.status === 'ok') {
    return 'good';
  }

  return row.critical ? 'bad' : 'warn';
}

function detail(row: Row): string {
  if (!row.result) {
    return '';
  }

  if (row.result.error) {
    return row.result.error;
  }

  if (row.result.details === undefined) {
    return row.slow ? `used ${Math.round((row.result.duration / row.timeout) * 100)}% of its timeout` : '';
  }

  return typeof row.result.details === 'string' ? row.result.details : JSON.stringify(row.result.details);
}

async function run(): Promise<void> {
  if (running.value) {
    return;
  }

  running.value = true;
  failure.value = null;

  try {
    const health = await runHealthChecks();

    if (mounted) {
      data.value = health;
    }
  } catch (error_) {
    failure.value = error_ instanceof Error ? error_.message : String(error_);
  } finally {
    running.value = false;
    now.value = Date.now();
  }
}

let refresh: ReturnType<typeof setInterval> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;

function schedule(): void {
  if (refresh) {
    clearInterval(refresh);
    refresh = null;
  }

  if (every.value > 0) {
    refresh = setInterval(() => void run(), every.value * 1000);
  }
}

watch(every, (seconds) => {
  globalThis.localStorage?.setItem('vercube-devtools-health-refresh', String(seconds));
  schedule();
});

// another inspector ran the checks, or the application changed state
watch(
  () => props.invalidated,
  (change) => {
    if (change?.id === 'health' && !running.value) {
      void reload();
    }
  },
);

let mounted = false;

onMounted(() => {
  mounted = true;

  // started before anything is awaited, so leaving the panel always finds them
  schedule();
  clock = setInterval(() => (now.value = Date.now()), 1000);

  void reload().then(() => {
    // a first look should show results, not a column of dashes
    if (mounted && data.value?.state === 'ready' && data.value.checks.length > 0 && !data.value.report) {
      void run();
    }
  });
});

onUnmounted(() => {
  mounted = false;

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
  <PageHeader title="Health" :meta="meta" :loading="loading || running" @reload="reload">
    <template #tools>
      <label class="every">
        <span class="label">Re-run</span>
        <select v-model.number="every" class="field">
          <option v-for="seconds in INTERVALS" :key="seconds" :value="seconds">
            {{ seconds === 0 ? 'manually' : `every ${seconds}s` }}
          </option>
        </select>
      </label>
      <button class="btn primary" type="button" :disabled="running || !data?.checks.length" @click="run">
        {{ running ? 'Running…' : 'Run checks' }}
      </button>
    </template>
  </PageHeader>

  <div class="body">
    <p v-if="error || failure" class="error">{{ error || failure }}</p>

    <template v-else-if="data">
      <div class="strip">
        <span class="item">
          <span class="label">State</span>
          <span class="mono" :class="stateTone">{{ data.state }}</span>
        </span>
        <span class="item">
          <span class="label">Liveness</span>
          <span class="mono" :class="liveness === 'ok' ? 'good' : 'bad'">{{ liveness }}</span>
        </span>
        <span class="item">
          <span class="label">Readiness</span>
          <span class="mono" :class="readiness.tone">{{ readiness.text }}</span>
        </span>
        <span class="item">
          <span class="label">Last run</span>
          <span class="mono">{{ lastRun }}</span>
        </span>
      </div>

      <div class="ledger checks">
        <table class="table">
          <thead>
            <tr>
              <th class="col-name">Check</th>
              <th class="col-status">Status</th>
              <th class="col-kind">Failure means</th>
              <th class="col-num">Took</th>
              <th class="col-num">Timeout</th>
              <th>Detail</th>
            </tr>
          </thead>

          <tbody v-if="groups.length === 0">
            <tr>
              <td colspan="6" class="none">
                No checks registered. Modules add theirs (queue, scheduler, storage), and
                <code class="mono">app.health.register()</code> adds your own.
              </td>
            </tr>
          </tbody>

          <tbody v-for="group in groups" :key="group.module">
            <tr class="band">
              <th scope="colgroup" colspan="6">
                <span class="name">{{ group.module }}</span>
                <span class="faint count">
                  {{ group.rows.length }} check{{ group.rows.length === 1 ? '' : 's'
                  }}{{ group.down ? `, ${group.down} failing` : '' }}
                </span>
              </th>
            </tr>

            <tr v-for="row in group.rows" :key="row.name" :class="{ failing: row.result?.status === 'down' }">
              <td class="mono col-name" :title="row.name">{{ row.label }}</td>
              <td class="mono col-status" :class="statusTone(row)">{{ row.result?.status ?? '--' }}</td>
              <td class="col-kind muted">{{ row.critical ? 'not ready' : 'degraded' }}</td>
              <td class="mono col-num" :class="{ warn: row.slow }">{{ row.result ? formatMs(row.result.duration) : '--' }}</td>
              <td class="mono col-num muted">{{ formatMs(row.timeout) }}</td>
              <td class="detail" :class="{ bad: row.result?.error }" :title="detail(row)">{{ detail(row) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="strip settings">
        <span v-for="entry in settings" :key="entry.label" class="item">
          <span class="label">{{ entry.label }}</span>
          <span class="mono">{{ entry.value }}</span>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.every {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  white-space: nowrap;
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

.strip.settings {
  border-top: 1px solid var(--edge);
  border-bottom: 0;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.checks {
  flex: 1;
}

.col-name {
  width: 26%;
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-status {
  width: 90px;
}

.col-kind {
  width: 120px;
}

.col-num {
  width: 90px;
  text-align: right;
}

.detail {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
  font-size: 12px;
}

.detail.bad {
  color: var(--err);
}

.band th {
  position: sticky;
  top: var(--row);
  z-index: 1;
  height: var(--row);
  padding: 0 12px;
  text-align: left;
  background: var(--panel-head);
  box-shadow:
    inset 0 1px 0 var(--edge),
    inset 0 -1px 0 var(--edge);
}

.name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.count {
  margin-left: 10px;
  font-size: 11px;
  font-weight: 400;
}

.failing .col-name {
  color: var(--text);
}

.none {
  color: var(--text-3);
  font-size: 12px;
}

p.error {
  margin: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 34%, transparent);
  background: var(--err-tint);
  color: var(--err);
  font-size: 12.5px;
}

@media (max-width: 720px) {
  .col-kind,
  .col-num {
    display: none;
  }
}
</style>
