<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { apiUrl, openStream } from './api';
import AuditView from './components/AuditView.vue';
import BootstrapView from './components/BootstrapView.vue';
import ConfigView from './components/ConfigView.vue';
import GraphView from './components/GraphView.vue';
import LogsView from './components/LogsView.vue';
import OverviewView from './components/OverviewView.vue';
import QueuesView from './components/QueuesView.vue';
import RequestsView from './components/RequestsView.vue';
import RoutesView from './components/RoutesView.vue';
import StorageView from './components/StorageView.vue';
import VercubeMark from './components/VercubeMark.vue';
import type { LogEntry, MetricsSample, RequestRecord } from './api';

type TabId = 'overview' | 'requests' | 'logs' | 'storage' | 'queues' | 'routes' | 'graph' | 'config' | 'bootstrap' | 'audit';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const groups: { label: string; tabs: Tab[] }[] = [
  {
    label: 'Runtime',
    tabs: [
      { id: 'overview', label: 'Overview', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
      { id: 'requests', label: 'Requests', icon: 'M3 12h3.5l2.5-7 4 14 2.5-7H21' },
      { id: 'logs', label: 'Logs', icon: 'M5 5h14M5 10h9M5 15h12M5 20h7' },
      {
        id: 'storage',
        label: 'Storage',
        icon: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
      },
      { id: 'queues', label: 'Queues', icon: 'm12 4 8 4-8 4-8-4 8-4Zm8 8-8 4-8-4m16 4-8 4-8-4' },
    ],
  },
  {
    label: 'Structure',
    tabs: [
      { id: 'routes', label: 'Routes', icon: 'M4 6h9a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h11m0 0-3-3m3 3-3 3' },
      {
        id: 'graph',
        label: 'Graph',
        icon: 'M12 4.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM5 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm14 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-8.4-6L6.4 14m7-5 4.2 5M7 17h10',
      },
      {
        id: 'config',
        label: 'Config',
        icon: 'M10.3 4h3.4l.4 2.3 2 1.2 2.2-.9 1.7 3-1.7 1.6v2.3l1.7 1.6-1.7 3-2.2-.9-2 1.2-.4 2.3h-3.4l-.4-2.3-2-1.2-2.2.9-1.7-3 1.7-1.6v-2.3L4 9.6l1.7-3 2.2.9 2-1.2Z',
      },
    ],
  },
  {
    label: 'Diagnostics',
    tabs: [
      { id: 'bootstrap', label: 'Bootstrap', icon: 'M4 6h16M4 11h11M4 16h6M4 21h13' },
      { id: 'audit', label: 'Audit', icon: 'M12 3.5 19 6.4v5.1c0 4.2-2.9 7-7 8.1-4.1-1.1-7-3.9-7-8.1V6.4Zm0 4.9v4m0 2.6v.1' },
    ],
  },
];

const flat = computed<Tab[]>(() => groups.flatMap((group) => group.tabs));

const active = ref<TabId>(readHash());

const live = ref<RequestRecord[]>([]);

const liveLogs = ref<LogEntry[]>([]);

const liveMetrics = ref<MetricsSample[]>([]);
const connected = ref(false);
const streaming = ref(true);
const theme = ref<'dark' | 'light'>(readTheme());

let closeStream: (() => void) | null = null;

function readHash(): TabId {
  const id = globalThis.location.hash.replace('#', '') as TabId;
  return groups.some((group) => group.tabs.some((tab) => tab.id === id)) ? id : 'overview';
}

function readTheme(): 'dark' | 'light' {
  const stored = globalThis.localStorage?.getItem('vercube-devtools-theme');

  if (stored === 'dark' || stored === 'light') {
    return stored;
  }

  return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value;
    globalThis.localStorage?.setItem('vercube-devtools-theme', value);
  },
  { immediate: true },
);

watch(active, (value) => {
  globalThis.history.replaceState(null, '', `#${value}`);
});

watch(streaming, (value) => (value ? connect() : disconnect()));

function connect(): void {
  closeStream?.();
  closeStream = openStream({
    onRequest: (record) => {
      const index = live.value.findIndex((entry) => entry.id === record.id);

      if (index === -1) {
        live.value = [record, ...live.value].slice(0, 500);
        return;
      }

      const next = [...live.value];
      next[index] = record;
      live.value = next;
    },
    onLog: (entry) => {
      liveLogs.value = [entry, ...liveLogs.value].slice(0, 1000);
    },
    onMetrics: (sample) => {
      liveMetrics.value = [...liveMetrics.value, sample].slice(-120);
    },
    onStatus: (state) => (connected.value = state),
  });
}

function disconnect(): void {
  closeStream?.();
  closeStream = null;
  connected.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;

  if (event.metaKey || event.ctrlKey || target?.tagName === 'INPUT' || target?.tagName === 'SELECT') {
    return;
  }

  const index = Number.parseInt(event.key, 10) - 1;
  const tab = flat.value[index];

  if (tab) {
    active.value = tab.id;
  }
}

function shortcut(id: TabId): number {
  return flat.value.findIndex((tab) => tab.id === id) + 1;
}

const snapshotUrl = computed(() => apiUrl('/api/snapshot'));

const status = computed(() => {
  if (!streaming.value) {
    return { label: 'Paused', tone: 'paused' };
  }

  return connected.value ? { label: 'Live', tone: 'live' } : { label: 'Connecting', tone: 'waiting' };
});

onMounted(() => {
  connect();
  globalThis.addEventListener('keydown', onKeydown);
  globalThis.addEventListener('hashchange', () => (active.value = readHash()));
});

onUnmounted(() => {
  disconnect();
  globalThis.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="shell">
    <aside class="rail">
      <div class="brand">
        <VercubeMark class="mark" />
        <div class="text">
          <strong>Vercube</strong>
          <span>Devtools</span>
        </div>
      </div>

      <nav class="nav scroll">
        <section v-for="group in groups" :key="group.label" class="group">
          <h2 class="eyebrow legend">{{ group.label }}</h2>

          <button
            v-for="tab in group.tabs"
            :key="tab.id"
            class="item"
            :class="{ active: active === tab.id }"
            type="button"
            :aria-current="active === tab.id ? 'page' : undefined"
            @click="active = tab.id"
          >
            <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
              <path
                :d="tab.icon"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="label">{{ tab.label }}</span>
            <kbd class="key">{{ shortcut(tab.id) }}</kbd>
          </button>
        </section>
      </nav>

      <div class="foot">
        <button
          class="status"
          :class="status.tone"
          type="button"
          :title="streaming ? 'Pause the live request stream' : 'Resume the live request stream'"
          @click="streaming = !streaming"
        >
          <span class="dot" />
          <span class="label">{{ status.label }}</span>
          <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
            <path
              v-if="streaming"
              d="M9 5v14M15 5v14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
            <path v-else d="M7 4.5v15l12-7.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
        </button>

        <div class="actions">
          <a class="btn ghost" :href="snapshotUrl" download title="Download everything devtools knows as JSON">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Snapshot
          </a>
          <button
            class="btn ghost square"
            type="button"
            :title="`Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`"
            @click="theme = theme === 'dark' ? 'light' : 'dark'"
          >
            <svg v-if="theme === 'dark'" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path
                d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <main class="stage">
      <OverviewView
        v-if="active === 'overview'"
        :live="live"
        :live-logs="liveLogs"
        :live-metrics="liveMetrics"
        @navigate="active = $event as TabId"
      />
      <RequestsView v-else-if="active === 'requests'" :live="live" :live-logs="liveLogs" />
      <LogsView v-else-if="active === 'logs'" :live="liveLogs" />
      <StorageView v-else-if="active === 'storage'" />

      <QueuesView v-else-if="active === 'queues'" />
      <ConfigView v-else-if="active === 'config'" />
      <RoutesView v-else-if="active === 'routes'" />
      <GraphView v-else-if="active === 'graph'" />
      <BootstrapView v-else-if="active === 'bootstrap'" />
      <AuditView v-else />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  height: 100%;
  background: var(--void);
}

.rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--chassis);
  border-right: 1px solid var(--edge);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 53px;
  padding: 0 16px;
  border-bottom: 1px solid var(--edge);
  flex: none;
}

.mark {
  width: 17px;
  height: 19px;
  flex: none;
}

.text {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.text strong {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.015em;
}

.text span {
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-3);
}

.nav {
  flex: 1;
  padding: 14px 10px 10px;
}

.group + .group {
  margin-top: 18px;
}

.legend {
  margin: 0 0 6px;
  padding: 0 8px;
  font-size: 9.5px;
  letter-spacing: 0.12em;
}

.item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.item:hover {
  background: var(--raised);
  color: var(--text);
}

.item.active {
  background: var(--raised);
  color: var(--text);
}

.item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--brand-grad);
}

.item.active .icon {
  color: var(--brand);
}

.icon {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--text-3);
  transition: color 0.12s ease;
}

.item:hover .icon {
  color: var(--text-2);
}

.label {
  flex: 1;
  text-align: left;
  font-size: 12.5px;
}

.key {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-3);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.item:hover .key,
.item.active .key {
  opacity: 1;
}

.foot {
  flex: none;
  display: grid;
  gap: 8px;
  padding: 12px 10px;
  border-top: 1px solid var(--edge);
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  transition: border-color 0.15s ease;
}

.status:hover {
  border-color: var(--edge-strong);
}

.label {
  flex: 1;
  text-align: left;
  font-size: 11.5px;
  letter-spacing: 0.02em;
}

.icon {
  width: 12px;
  height: 12px;
  color: var(--text-3);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  flex: none;
}

.status.live {
  color: var(--text);
}

.status.live .dot {
  background: var(--ok);
}

.status.waiting .dot {
  background: var(--warn);
}

@media (prefers-reduced-motion: no-preference) {
  .status.live .dot {
    animation: beat 2.4s ease-out infinite;
  }
}

@keyframes beat {
  0% {
    box-shadow: 0 0 0 0 var(--ok-tint);
  }
  70%,
  100% {
    box-shadow: 0 0 0 5px transparent;
  }
}

.actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
}

.actions .btn {
  justify-content: center;
  text-decoration: none;
}

.square {
  width: 28px;
  padding: 0;
}

.stage {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 53px minmax(0, 1fr);
  }

  .brand {
    justify-content: center;
    padding: 0;
  }

  .nav {
    padding: 10px 8px;
  }

  .item {
    justify-content: center;
    padding: 0;
  }

  .label,
  .key,
  .legend,
  .text,
  .status .icon {
    display: none;
  }

  .item.active::before {
    left: -8px;
  }

  .status {
    justify-content: center;
    padding: 0;
  }

  .actions {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .actions .btn:first-child {
    font-size: 0;
    width: 28px;
    padding: 0;
    gap: 0;
  }
}
</style>
