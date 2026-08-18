<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, useResource } from '../api';
import PageHeader from './PageHeader.vue';
import type { LogEntry, LogLevel } from '../api';

const props = defineProps<{
  live: LogEntry[];
}>();

const { data, error, loading, reload } = useResource<LogEntry[]>('/api/logs');

const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const query = ref('');
const hidden = ref<Set<LogLevel>>(new Set());
const expanded = ref<Set<string>>(new Set());

const entries = computed(() => {
  const merged = new Map<string, LogEntry>();

  for (const entry of [...props.live, ...(data.value ?? [])]) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()].sort((a, b) => b.at - a.at || Number(b.id) - Number(a.id));
});

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return entries.value
    .filter((entry) => !hidden.value.has(entry.level))
    .filter(
      (entry) =>
        !needle ||
        entry.message.toLowerCase().includes(needle) ||
        (entry.context ? JSON.stringify(entry.context).toLowerCase().includes(needle) : false),
    );
});

const counts = computed(() => {
  const tally: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };

  for (const entry of entries.value) {
    tally[entry.level]++;
  }

  return tally;
});

const meta = computed(() => {
  const errors = counts.value.error;
  return `${filtered.value.length} line${filtered.value.length === 1 ? '' : 's'}${errors ? ` · ${errors} error` : ''}`;
});

function toggle(level: LogLevel): void {
  const next = new Set(hidden.value);

  if (next.has(level)) {
    next.delete(level);
  } else {
    next.add(level);
  }

  hidden.value = next;
}

function expand(id: string): void {
  const next = new Set(expanded.value);

  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  expanded.value = next;
}

async function clear(): Promise<void> {
  await api('/api/logs', { method: 'DELETE' });
  expanded.value = new Set();
  await reload();
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour12: false });
}

onMounted(reload);
</script>

<template>
  <PageHeader title="Logs" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter logs…" />
      <button
        v-for="level in levels"
        :key="level"
        class="filter"
        :class="{ off: hidden.has(level) }"
        type="button"
        :aria-pressed="!hidden.has(level)"
        @click="toggle(level)"
      >
        <span class="dot" :class="level" />
        {{ level }}
        <span class="mono faint">{{ counts[level] }}</span>
      </button>
      <button class="btn" type="button" @click="clear">Clear</button>
    </template>
  </PageHeader>

  <div class="body">
    <p v-if="error" class="error">{{ error }}</p>

    <div v-else-if="!loading && filtered.length === 0" class="empty">
      <span>{{ entries.length === 0 ? 'Nothing logged yet.' : 'No line matches the filter.' }}</span>
      <span>
        {{
          entries.length === 0
            ? 'Anything written through the Logger service shows up here as it happens.'
            : 'Turn a level back on or clear the search.'
        }}
      </span>
    </div>

    <div v-else class="ledger">
      <table class="table">
        <thead>
          <tr>
            <th class="col-time">Time</th>
            <th class="col-level">Level</th>
            <th>Message</th>
            <th class="col-request">Request</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in filtered" :key="entry.id">
            <tr
              class="line"
              :class="[entry.level, { open: expanded.has(entry.id) }]"
              :tabindex="entry.context ? 0 : -1"
              @click="entry.context && expand(entry.id)"
              @keydown.enter.prevent="entry.context && expand(entry.id)"
            >
              <td class="mono faint col-time">{{ formatTime(entry.at) }}</td>
              <td>
                <span class="level" :class="entry.level">{{ entry.level }}</span>
              </td>
              <td class="message">
                {{ entry.message }}
                <span v-if="entry.context" class="fields mono">{{ Object.keys(entry.context).join(' ') }}</span>
              </td>

              <td class="mono faint col-request">{{ entry.requestId ? `#${entry.requestId}` : '--' }}</td>
            </tr>

            <tr v-if="entry.context && expanded.has(entry.id)" class="context">
              <td colspan="4">
                <pre class="code">{{ JSON.stringify(entry.context, null, 2) }}</pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.search {
  width: 170px;
}

.filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  text-transform: capitalize;
}

.filter.off {
  color: var(--text-3);
  opacity: 0.55;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}

.filter.off .dot {
  background: var(--text-3) !important;
}

.dot.debug {
  background: var(--text-3);
}

.dot.info {
  background: var(--info);
}

.dot.warn {
  background: var(--warn);
}

.dot.error {
  background: var(--err);
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.col-time {
  width: 92px;
}

.col-level {
  width: 66px;
}

.col-request {
  width: 84px;
  text-align: right;
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

.message {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.fields {
  margin-left: 10px;
  font-size: 10.5px;
  color: var(--text-3);
}

.line[tabindex='0'] {
  cursor: pointer;
}

.line.open td {
  background: var(--panel-head);
}

.line.error td:first-child {
  box-shadow: inset 2px 0 0 var(--err);
}

.line.warn td:first-child {
  box-shadow: inset 2px 0 0 var(--warn);
}

.context td {
  height: auto;
  padding: 0 12px 10px;
  background: var(--panel-head);
  box-shadow: inset 0 -1px 0 var(--edge);
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

@media (max-width: 820px) {
  .col-request {
    display: none;
  }
}
</style>
