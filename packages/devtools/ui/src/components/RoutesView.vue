<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useResource } from '../api';
import { useInspectorWidth } from '../inspector';
import PageHeader from './PageHeader.vue';
import SplitHandle from './SplitHandle.vue';
import type { RouteInfo } from '../api';

const { data, error, loading, reload } = useResource<RouteInfo[]>('/api/routes');

const query = ref('');
const showInternal = ref(false);
const selectedId = ref<string | null>(null);

const DEFAULT_INSPECTOR_WIDTH = 380;

const inspectorWidth = useInspectorWidth('routes-inspector', DEFAULT_INSPECTOR_WIDTH);

const methodOrder = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE'];

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return (data.value ?? [])
    .filter((route) => showInternal.value || !route.internal)
    .filter(
      (route) =>
        !needle ||
        route.path.toLowerCase().includes(needle) ||
        route.controller.toLowerCase().includes(needle) ||
        route.handler.toLowerCase().includes(needle) ||
        route.method.toLowerCase().includes(needle),
    );
});

const groups = computed(() => {
  const map = new Map<string, RouteInfo[]>();

  for (const route of filtered.value) {
    map.set(route.controller, [...(map.get(route.controller) ?? []), route]);
  }

  return [...map.entries()]
    .map(([controller, routes]) => ({
      controller,
      routes: [...routes].sort(
        (a, b) => a.path.localeCompare(b.path) || methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method),
      ),
    }))
    .sort((a, b) => a.controller.localeCompare(b.controller));
});

function keyOf(route: RouteInfo): string {
  return `${route.method} ${route.id} ${route.handler}`;
}

function select(route: RouteInfo): void {
  const key = keyOf(route);
  selectedId.value = selectedId.value === key ? null : key;
}

const selected = computed(() => filtered.value.find((route) => keyOf(route) === selectedId.value) ?? null);

watch(filtered, (routes) => {
  if (selectedId.value && !routes.some((route) => keyOf(route) === selectedId.value)) {
    selectedId.value = null;
  }
});

function methodTone(method: string): string {
  switch (method.split(' / ')[0]) {
    case 'GET':
    case 'HEAD': {
      return 'read';
    }
    case 'DELETE': {
      return 'destroy';
    }
    case 'POST':
    case 'PUT':
    case 'PATCH': {
      return 'write';
    }
    default: {
      return '';
    }
  }
}

const meta = computed(
  () =>
    `${filtered.value.length} route${filtered.value.length === 1 ? '' : 's'} · ` +
    `${groups.value.length} controller${groups.value.length === 1 ? '' : 's'}`,
);

onMounted(reload);
</script>

<template>
  <PageHeader title="Routes" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter routes…" />
      <button class="btn" :class="{ active: showInternal }" type="button" @click="showInternal = !showInternal">
        Devtools routes
      </button>
    </template>
  </PageHeader>

  <div class="body" :class="{ open: selected }" :style="{ '--inspector': `${inspectorWidth}px` }">
    <p v-if="error" class="error">{{ error }}</p>

    <div v-else-if="!loading && groups.length === 0" class="empty">
      <span>No routes match “{{ query }}”.</span>
      <span>Clear the filter to see all {{ data?.length ?? 0 }} of them.</span>
    </div>

    
    <div v-else class="ledger">
      <table class="table">
        <thead>
          <tr>
            <th class="col-method">Method</th>
            <th>Path</th>
            <th class="col-handler">Handler</th>
            <th class="col-chain">Chain</th>
            <th class="col-args">Args</th>
            <th class="col-toggle" aria-label="Details" />
          </tr>
        </thead>

        <tbody v-for="group in groups" :key="group.controller">
          <tr class="band">
            <th colspan="5" scope="colgroup">
              <span class="mono name">{{ group.controller }}</span>
            </th>
            <td class="count mono faint" colspan="1">{{ group.routes.length }}</td>
          </tr>

          <tr
            v-for="route in group.routes"
            :key="keyOf(route)"
            class="route"
            :class="{ open: selectedId === keyOf(route) }"
            tabindex="0"
            role="button"
            :aria-pressed="selectedId === keyOf(route)"
            @click="select(route)"
            @keydown.enter.prevent="select(route)"
            @keydown.space.prevent="select(route)"
          >
            <td>
              <span class="method" :class="methodTone(route.method)">{{ route.method }}</span>
            </td>
            <td class="mono path">
              {{ route.path }}
              <span v-if="route.internal" class="tag teal">devtools</span>
            </td>
            <td class="mono faint handler">{{ route.handler }}()</td>
            <td class="mono col-chain">{{ route.middlewares.length || '--' }}</td>
            <td class="mono col-args">{{ route.args.length || '--' }}</td>
            <td class="col-toggle">
              <svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">
                <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <SplitHandle
      v-if="selected"
      v-model="inspectorWidth"
      :initial="DEFAULT_INSPECTOR_WIDTH"
      :min="300"
      :max="900"
      label="Resize the route panel"
    />

    <aside v-if="selected" class="inspector scroll">
      <header class="head">
        <div class="title">
          <span class="method" :class="methodTone(selected.method)">{{ selected.method }}</span>
          <span class="mono path">{{ selected.path }}</span>
          <button class="close" type="button" title="Close the route panel" @click="selectedId = null">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <p class="meta mono">{{ selected.controller }}.{{ selected.handler }}()</p>
      </header>

      <section class="block">
        <h3 class="label">Arguments</h3>
        <ul v-if="selected.args.length" class="stack">
          <li v-for="arg in selected.args" :key="arg.idx">
            <span class="mono faint index">{{ arg.idx }}</span>
            <span class="mono">{{ arg.type }}</span>
            <code v-if="arg.name">{{ arg.name }}</code>
            <span class="tag" :class="arg.validated ? 'green' : 'amber'">
              {{ arg.validated ? 'validated' : 'unvalidated' }}
            </span>
          </li>
        </ul>
        <p v-else class="none">Handler takes no decorated arguments.</p>
      </section>

      <section class="block">
        <h3 class="label">Middleware chain</h3>
        <ol v-if="selected.middlewares.length" class="stack">
          <li v-for="(middleware, position) in selected.middlewares" :key="`${middleware.name}-${position}`">
            <span class="phase" :class="middleware.phase">{{ middleware.phase }}</span>
            <span class="mono">{{ middleware.name }}</span>
            <span class="mono faint">p{{ middleware.priority }}</span>
            <span v-if="middleware.global" class="tag teal">global</span>
          </li>
        </ol>
        <p v-else class="none">No middlewares run for this route.</p>
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

.body > .ledger {
  min-width: 0;
}

.band th,
.band td {
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
  text-align: right;
  font-size: 11px;
}

.method {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

.method.read {
  color: var(--ok);
}

.method.write {
  color: var(--brand-2);
}

.method.destroy {
  color: var(--err);
}

.col-method {
  width: 96px;
}

.col-handler {
  width: 190px;
}

.col-chain,
.col-args {
  width: 62px;
  text-align: right;
}

.col-toggle {
  width: 30px;
}

.route {
  cursor: pointer;
}

.path {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path .tag {
  margin-left: 8px;
  vertical-align: middle;
}

.handler {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  display: block;
  width: 13px;
  height: 13px;
  color: var(--text-3);
  transition: color 0.12s ease;
}

.route.open .chevron {
  color: var(--brand);
}

.route.open td,
.route.open:hover td {
  background: var(--brand-tint);
}

.route.open td:first-child {
  box-shadow: inset 2px 0 0 var(--brand);
}

.route.open .chevron {
  color: var(--brand);
}

.inspector {
  display: grid;
  gap: 18px;
  align-content: start;
  padding: 14px 16px 32px;
  border-left: 1px solid var(--edge);
  background: var(--chassis);
}

.title {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.title .close {
  margin-left: auto;
}

.path {
  font-size: 13px;
  word-break: break-all;
}

.meta {
  margin: 7px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.block {
  display: grid;
  gap: 9px;
}

.block .label {
  margin: 0;
}

.stack {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
}

.stack li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  height: 28px;
  font-size: 12px;
}

.stack li + li {
  border-top: 1px solid var(--edge-soft);
}

.index {
  width: 12px;
  font-size: 10.5px;
}

.phase {
  min-width: 44px;
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.phase.before {
  color: var(--brand);
}

.phase.after {
  color: var(--info);
}

.none {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

p.error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 34%, transparent);
  border-radius: var(--radius-sm);
  background: var(--err-tint);
  color: var(--err);
  font-size: 12.5px;
}

@media (max-width: 900px) {
  .col-handler,
  .handler {
    display: none;
  }
}
</style>
