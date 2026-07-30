<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, formatBytes, formatMs, statusClass, statusTone, useResource } from '../api';
import { useInspectorWidth } from '../inspector';
import PageHeader from './PageHeader.vue';
import SplitHandle from './SplitHandle.vue';
import type { LogEntry, Payload, RequestRecord } from '../api';

const props = defineProps<{
  live: RequestRecord[];
  liveLogs: LogEntry[];
}>();

const { data, error, loading, reload } = useResource<RequestRecord[]>('/api/requests');
const logs = useResource<LogEntry[]>('/api/logs');

const query = ref('');
const onlyErrors = ref(false);
const selectedId = ref<string | null>(null);

const records = computed(() => {
  const merged = new Map<string, RequestRecord>();

  for (const record of [...props.live, ...(data.value ?? [])]) {
    merged.set(record.id, record);
  }

  return [...merged.values()].sort((a, b) => b.startedAt - a.startedAt || Number(b.id) - Number(a.id));
});

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return records.value
    .filter((record) => !onlyErrors.value || record.status >= 400)
    .filter(
      (record) =>
        !needle ||
        record.path.toLowerCase().includes(needle) ||
        record.method.toLowerCase().includes(needle) ||
        String(record.status).includes(needle) ||
        (record.controller ?? '').toLowerCase().includes(needle),
    );
});

const selected = computed(() => records.value.find((record) => record.id === selectedId.value) ?? null);

const slowest = computed(() => Math.max(1, ...filtered.value.map((record) => record.durationMs)));

const timeline = computed(() => {
  const record = selected.value;

  if (!record) {
    return [];
  }

  const covered = record.spans.reduce((sum, span) => sum + span.durationMs, 0);
  const overhead = Math.max(0, record.durationMs - covered);

  return [
    ...record.spans.map((span) => ({
      name: span.name,
      kind: span.kind,
      offset: (span.offsetMs / record.durationMs) * 100,
      width: Math.max(0.6, (span.durationMs / record.durationMs) * 100),
      duration: span.durationMs,
    })),
    ...(overhead > 0.05
      ? [
          {
            name: 'framework (routing, argument resolution, serialization)',
            kind: 'overhead' as const,
            offset: 0,
            width: 100,
            duration: overhead,
          },
        ]
      : []),
  ];
});

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString(undefined, { hour12: false });
}

async function clear(): Promise<void> {
  await api('/api/requests', { method: 'DELETE' });
  selectedId.value = null;
  await reload();
}

const meta = computed(() => {
  const total = filtered.value.length;
  const failures = filtered.value.filter((record) => record.status >= 400).length;

  return `${total} recorded${failures ? ` · ${failures} failed` : ''}`;
});

function select(id: string): void {
  selectedId.value = selectedId.value === id ? null : id;
}

const DEFAULT_INSPECTOR_WIDTH = 440;

const inspectorWidth = useInspectorWidth('requests-inspector', DEFAULT_INSPECTOR_WIDTH);

const bodies = computed(() => {
  const record = selected.value;

  if (!record) {
    return [];
  }

  return [
    { title: 'Request body', payload: record.requestBody },
    { title: 'Response body', payload: record.responseBody },
  ].filter((entry): entry is { title: string; payload: Payload } => Boolean(entry.payload));
});

const OMISSIONS: Record<string, string> = {
  empty: 'Empty body.',
  binary: 'Binary body, not decoded.',
  'too-large': 'Body too large to keep.',
  streaming: 'Streaming response, not buffered.',
  unreadable: 'Body could not be read.',
};

function formatBody(payload: Payload): string {
  const text = payload.text ?? '';
  const trimmed = text.trimStart();

  if (payload.truncated || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const requestLogs = computed(() => {
  const id = selectedId.value;

  if (!id) {
    return [];
  }

  const merged = new Map<string, LogEntry>();

  for (const entry of [...props.liveLogs, ...(logs.data.value ?? [])]) {
    if (entry.requestId === id) {
      merged.set(entry.id, entry);
    }
  }

  return [...merged.values()].sort((a, b) => a.at - b.at || Number(a.id) - Number(b.id));
});

async function reloadAll(): Promise<void> {
  await Promise.all([reload(), logs.reload()]);
}

function describeBody(payload: Payload): string {
  const type = payload.contentType?.split(';')[0] ?? 'unknown type';
  return payload.size > 0 ? `${type} · ${formatBytes(payload.size)}` : type;
}

watch(records, (value) => {
  if (selectedId.value && !value.some((record) => record.id === selectedId.value)) {
    selectedId.value = null;
  }
});

onMounted(reloadAll);
</script>

<template>
  <PageHeader title="Requests" :meta="meta" :loading="loading" @reload="reloadAll">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter requests…" />
      <button class="btn" :class="{ active: onlyErrors }" type="button" @click="onlyErrors = !onlyErrors">
        Errors only
      </button>
      <button class="btn" type="button" @click="clear">Clear</button>
    </template>
  </PageHeader>

  <div class="split" :class="{ open: selected }" :style="{ '--inspector': `${inspectorWidth}px` }">
    <div class="list">
      <p v-if="error" class="error">{{ error }}</p>

      <div v-else-if="!loading && filtered.length === 0" class="empty">
        <span>Nothing recorded yet.</span>
        <span>Call an endpoint and it appears here as it happens.</span>
      </div>

      <div v-else class="ledger">
        <table class="table">
          <thead>
            <tr>
              <th class="col-status">Status</th>
              <th class="col-method">Method</th>
              <th>Path</th>
              <th class="col-time">Started</th>
              <th class="col-took">Took</th>
              <th class="col-bar">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in filtered" :key="record.id"
              class="item"
              :class="{ selected: selectedId === record.id }"
              tabindex="0"
              @click="select(record.id)"
              @keydown.enter="select(record.id)"
            >
              <td>
                <span class="status" :class="statusClass(record.status)">{{ record.status || '---' }}</span>
              </td>
              <td class="mono faint">{{ record.method }}</td>
              <td class="mono path">{{ record.path }}</td>
              <td class="mono faint col-time">{{ formatTime(record.startedAt) }}</td>
              <td class="mono col-took">{{ formatMs(record.durationMs) }}</td>
              <td class="col-bar">
                
                <span class="spark">
                  <span
                    class="fill"
                    :class="{ slow: record.durationMs > 250 }"
                    :style="{ width: `${Math.max(2, (record.durationMs / slowest) * 100)}%` }"
                  />
                </span>
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
      :min="320"
      :max="1100"
      label="Resize the inspector"
    />

    <aside v-if="selected" class="detail scroll">
      <header class="head">
        <div class="title">
          <span class="tag" :class="statusTone(selected.status)">{{ selected.status }}</span>
          <span class="mono method">{{ selected.method }}</span>
          <span class="mono path">{{ selected.path }}</span>
          <button class="close" type="button" title="Close the inspector" @click="selectedId = null">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <p class="meta">
          <span v-if="selected.controller" class="mono">{{ selected.controller }}.{{ selected.handler }}()</span>
          <span v-else class="muted">no route matched</span>
          <span class="dot">·</span>
          <span>{{ formatMs(selected.durationMs) }}</span>
          <span class="dot">·</span>
          <span>{{ formatTime(selected.startedAt) }}</span>
        </p>
      </header>

      <section v-if="selected.error" class="block error">
        <h3 class="label">Error</h3>
        <strong class="mono">{{ selected.error.name }}: {{ selected.error.message }}</strong>
        <pre v-if="selected.error.stack" class="stack">{{ selected.error.stack }}</pre>
      </section>

      <section class="block">
        <h3 class="label">Timeline</h3>
        <div v-if="timeline.length" class="waterfall">
          <div v-for="(span, index) in timeline" :key="`${span.name}-${index}`" class="span">
            <span class="mono name" :title="span.name">{{ span.name }}</span>
            <span class="track">
              <span
                class="bar"
                :class="span.kind.replace(':', '-')"
                :style="{ left: `${span.offset}%`, width: `${span.width}%` }"
              />
            </span>
            <span class="duration mono">{{ formatMs(span.duration) }}</span>
          </div>
        </div>
        <p v-else class="muted">
          No spans recorded. Middleware and handler timings appear for requests handled after devtools attached.
        </p>
      </section>

      <section v-if="requestLogs.length" class="block">
        <h3 class="label">
          Logs
          <span class="faint meta">{{ requestLogs.length }}</span>
        </h3>

        <ol class="transcript">
          <li v-for="entry in requestLogs" :key="entry.id" :class="entry.level">
            <span class="mono faint at">{{ formatTime(entry.at) }}</span>
            <span class="level">{{ entry.level }}</span>
            <span class="text">{{ entry.message }}</span>
          </li>
        </ol>
      </section>

      <section v-for="body in bodies" :key="body.title" class="block">
        <h3 class="label">
          {{ body.title }}
          <span class="faint meta">{{ describeBody(body.payload) }}</span>
        </h3>

        <pre v-if="body.payload.text" class="code">{{ formatBody(body.payload) }}</pre>
        <p v-else class="muted">{{ OMISSIONS[body.payload.omitted ?? ''] ?? 'Body not captured.' }}</p>

        <p v-if="body.payload.truncated" class="muted note">
          Showing the first {{ formatBytes(body.payload.text?.length ?? 0) }} of {{ formatBytes(body.payload.size) }}.
        </p>
      </section>

      <section v-if="Object.keys(selected.query).length" class="block">
        <h3 class="label">Query</h3>
        <dl class="kv">
          <template v-for="(value, key) in selected.query" :key="key">
            <dt class="mono">{{ key }}</dt>
            <dd class="mono">{{ value }}</dd>
          </template>
        </dl>
      </section>

      <section v-if="Object.keys(selected.requestHeaders).length" class="block">
        <h3 class="label">Request headers</h3>
        <dl class="kv">
          <template v-for="(value, key) in selected.requestHeaders" :key="key">
            <dt class="mono">{{ key }}</dt>
            <dd class="mono">{{ value }}</dd>
          </template>
        </dl>
      </section>

      <section v-if="Object.keys(selected.responseHeaders).length" class="block">
        <h3 class="label">Response headers</h3>
        <dl class="kv">
          <template v-for="(value, key) in selected.responseHeaders" :key="key">
            <dt class="mono">{{ key }}</dt>
            <dd class="mono">{{ value }}</dd>
          </template>
        </dl>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.search {
  width: 190px;
}

.split {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.split.open {
  grid-template-columns: minmax(0, 1fr) var(--inspector);
}

.list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--edge);
}

.col-status {
  width: 76px;
}

.col-method {
  width: 70px;
}

.col-time,
.col-took {
  width: 84px;
  text-align: right;
}

.col-bar {
  width: 110px;
}

.item {
  cursor: pointer;
}

.item.selected td,
.item.selected:hover td {
  background: var(--brand-tint);
}

.item.selected td:first-child {
  box-shadow: inset 2px 0 0 var(--brand);
}

.method {
  color: var(--text-2);
}

.path {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spark {
  display: block;
  height: 4px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  background: var(--brand-2);
}

.fill.slow {
  background: var(--warn);
}

.detail {
  display: grid;
  gap: 18px;
  align-content: start;
  padding: 16px 16px 32px;
  background: var(--chassis);
}

.detail .label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
}

.meta {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 400;
  white-space: nowrap;
}

.note {
  font-size: 11px;
}

.transcript {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
}

.transcript li {
  display: grid;
  grid-template-columns: 62px 42px minmax(0, 1fr);
  gap: 9px;
  align-items: baseline;
  padding: 5px 0;
  font-size: 11.5px;
}

.transcript li + li {
  border-top: 1px solid var(--edge-soft);
}

.at {
  font-size: 10.5px;
}

.level {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.transcript li.info .level {
  color: var(--info);
}

.transcript li.warn .level {
  color: var(--warn);
}

.transcript li.error .level {
  color: var(--err);
}

.text {
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.title .close {
  margin-left: auto;
}

.method {
  font-size: 12px;
  color: var(--text-2);
}

.path {
  font-size: 13.5px;
  word-break: break-all;
}

.meta {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-2);
}

.dot {
  color: var(--text-3);
}

.block {
  display: grid;
  gap: 9px;
}

.block.error strong {
  font-size: 12.5px;
  color: var(--err);
}

.stack {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--panel);
  border: 1px solid var(--edge);
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--text-2);
  overflow: auto;
  max-height: 200px;
  white-space: pre-wrap;
}

.waterfall {
  display: grid;
  gap: 4px;
}

.span {
  display: grid;
  grid-template-columns: minmax(0, 118px) minmax(0, 1fr) 58px;
  align-items: center;
  gap: 9px;
}

.name {
  font-size: 11px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  position: relative;
  height: 14px;
  border-radius: var(--radius-sm);
  background: var(--raised);
  border: 1px solid var(--edge);
}

.bar {
  position: absolute;
  top: 2px;
  bottom: 2px;
  min-width: 2px;
  border-radius: var(--radius-sm);
  background: var(--brand);
}

.bar.middleware-before {
  background: var(--brand);
}

.bar.middleware-after {
  background: var(--info);
}

.bar.handler {
  background: var(--ok);
}

.bar.overhead {
  background: repeating-linear-gradient(135deg, var(--edge-strong) 0 4px, transparent 4px 8px);
}

.duration {
  font-size: 11px;
  color: var(--text-3);
  text-align: right;
}

.kv {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: 4px 14px;
  margin: 0;
  font-size: 11.5px;
}

.kv dt {
  color: var(--text-3);
}

.kv dd {
  margin: 0;
  color: var(--text-2);
  word-break: break-all;
}

.muted {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.error {
  margin: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 34%, transparent);
  border-radius: var(--radius-sm);
  background: var(--err-tint);
  color: var(--err);
  font-size: 12.5px;
}

@media (max-width: 1180px) {
  .col-bar,
  .col-time {
    display: none;
  }
}

@media (max-width: 1080px) {
  .split {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }

  .list {
    border-right: none;
    border-bottom: 1px solid var(--edge);
  }
}
</style>
