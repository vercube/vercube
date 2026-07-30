<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { formatMs, useResource } from '../api';
import PageHeader from './PageHeader.vue';
import type { Graph, ServiceNode } from '../api';

interface Placed {
  node: ServiceNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const { data, error, loading, reload } = useResource<Graph>('/api/graph');

const roles = ['controller', 'middleware', 'service', 'plugin', 'framework', 'value'] as const;
type Role = (typeof roles)[number];

const hidden = ref<Set<Role>>(new Set(['framework']));
const query = ref('');
const selectedId = ref<string | null>(null);
const placed = shallowRef<Placed[]>([]);
const view = ref({ x: 0, y: 0, scale: 1 });
const dragging = ref<{ id: string | null; startX: number; startY: number; originX: number; originY: number } | null>(null);
const canvas = ref<SVGSVGElement | null>(null);

const width = 1200;
const height = 780;

let frame = 0;

const visibleNodes = computed(() => (data.value?.nodes ?? []).filter((node) => !hidden.value.has(node.role as Role)));

const visibleEdges = computed(() => {
  const ids = new Set(visibleNodes.value.map((node) => node.id));
  return (data.value?.edges ?? []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
});

const cycleIds = computed(() => new Set((data.value?.cycles ?? []).flat()));

const selected = computed(() => visibleNodes.value.find((node) => node.id === selectedId.value) ?? null);

const dependents = computed(() => {
  if (!selected.value) {
    return [];
  }

  return visibleEdges.value
    .filter((edge) => edge.to === selected.value!.id)
    .map((edge) => ({ id: edge.from, property: edge.property }));
});

const neighbours = computed(() => {
  if (!selectedId.value) {
    return null;
  }

  const set = new Set<string>([selectedId.value]);

  for (const edge of visibleEdges.value) {
    if (edge.from === selectedId.value) {
      set.add(edge.to);
    }
    if (edge.to === selectedId.value) {
      set.add(edge.from);
    }
  }

  return set;
});

const matches = computed(() => {
  const needle = query.value.trim().toLowerCase();

  if (!needle) {
    return null;
  }

  return new Set(visibleNodes.value.filter((node) => node.name.toLowerCase().includes(needle)).map((node) => node.id));
});

const placedById = computed(() => new Map(placed.value.map((entry) => [entry.node.id, entry])));

const viewBox = computed(() => {
  const entries = placed.value;

  if (entries.length === 0) {
    return `0 0 ${width} ${height}`;
  }

  const padding = 90;
  const minX = Math.min(...entries.map((entry) => entry.x - entry.radius)) - padding;
  const maxX = Math.max(...entries.map((entry) => entry.x + entry.radius)) + padding;
  const minY = Math.min(...entries.map((entry) => entry.y - entry.radius)) - padding * 0.7;
  const maxY = Math.max(...entries.map((entry) => entry.y + entry.radius)) + padding;

  return `${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`;
});

function layout(): void {
  const nodes = visibleNodes.value;

  if (nodes.length === 0) {
    placed.value = [];
    return;
  }

  const previous = placedById.value;

  const entries: Placed[] = nodes.map((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2;
    const existing = previous.get(node.id);

    return {
      node,
      x: existing?.x ?? width / 2 + Math.cos(angle) * 260,
      y: existing?.y ?? height / 2 + Math.sin(angle) * 260,
      vx: 0,
      vy: 0,
      radius: 8 + Math.min(11, Math.sqrt(node.dependents + node.dependencies.length) * 3),
    };
  });

  const index = new Map(entries.map((entry) => [entry.node.id, entry]));
  const links = visibleEdges.value
    .map((edge) => ({ source: index.get(edge.from)!, target: index.get(edge.to)! }))
    .filter((link) => link.source && link.target && link.source !== link.target);

  const iterations = 360;
  const repulsion = 12_000;
  const springLength = 165;

  for (let step = 0; step < iterations; step++) {
    const alpha = 1 - step / iterations;

    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];

      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < 1) {
          dx = (i - j) * 0.5 + 0.1;
          dy = (j - i) * 0.5 + 0.1;
          distanceSquared = dx * dx + dy * dy;
        }

        const force = repulsion / distanceSquared;
        const distance = Math.sqrt(distanceSquared);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - springLength) * 0.06;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      link.source.vx += fx;
      link.source.vy += fy;
      link.target.vx -= fx;
      link.target.vy -= fy;
    }

    for (const entry of entries) {
      entry.vx += (width / 2 - entry.x) * 0.012;
      entry.vy += (height / 2 - entry.y) * 0.012;
      entry.x += entry.vx * alpha * 0.35;
      entry.y += entry.vy * alpha * 0.35;
      entry.vx *= 0.82;
      entry.vy *= 0.82;
    }
  }

  placed.value = entries;
}

function nodeOpacity(id: string): number {
  if (matches.value && !matches.value.has(id)) {
    return 0.14;
  }

  if (neighbours.value && !neighbours.value.has(id)) {
    return 0.16;
  }

  return 1;
}

function toggleRole(role: Role): void {
  const next = new Set(hidden.value);

  if (next.has(role)) {
    next.delete(role);
  } else {
    next.add(role);
  }

  hidden.value = next;
}

function unitsPerPixel(): number {
  const element = canvas.value;

  if (!element) {
    return 1;
  }

  const boxWidth = Number.parseFloat(viewBox.value.split(' ')[2]);
  const rect = element.getBoundingClientRect();

  return rect.width > 0 ? boxWidth / rect.width : 1;
}

function onPointerDown(event: PointerEvent, id: string | null): void {
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  const origin = id ? placedById.value.get(id) : null;

  dragging.value = {
    id,
    startX: event.clientX,
    startY: event.clientY,
    originX: origin ? origin.x : view.value.x,
    originY: origin ? origin.y : view.value.y,
  };
}

function onPointerMove(event: PointerEvent): void {
  const state = dragging.value;

  if (!state) {
    return;
  }

  const ratio = unitsPerPixel() / view.value.scale;
  const dx = (event.clientX - state.startX) * ratio;
  const dy = (event.clientY - state.startY) * ratio;

  if (state.id) {
    const entry = placedById.value.get(state.id);

    if (entry) {
      entry.x = state.originX + dx;
      entry.y = state.originY + dy;
      placed.value = [...placed.value];
    }

    return;
  }

  view.value = { ...view.value, x: state.originX + dx, y: state.originY + dy };
}

function onPointerUp(): void {
  dragging.value = null;
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  const next = Math.min(2.6, Math.max(0.32, view.value.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
  view.value = { ...view.value, scale: next };
}

function reset(): void {
  view.value = { x: 0, y: 0, scale: 1 };
  placed.value = [];
  layout();
}

watch([visibleNodes, visibleEdges], () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(layout);
});

const meta = computed(() => {
  const graph = data.value;

  if (!graph) {
    return '';
  }

  const unused = graph.unusedCount ? ` · ${graph.unusedCount} never built` : '';
  return `${graph.nodes.length} bindings · ${graph.edges.length} edges${unused}`;
});

onMounted(reload);
onUnmounted(() => cancelAnimationFrame(frame));
</script>

<template>
  <PageHeader title="Graph" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter services…" />
      <button class="btn" type="button" @click="reset">Re-layout</button>
    </template>
  </PageHeader>

  <div class="filters">
    <button
      v-for="role in roles" :key="role"
      class="chip"
      :class="[role, { off: hidden.has(role) }]"
      type="button"
      @click="toggleRole(role)"
    >
      <span class="dot" />
      {{ role }}
      <span class="count">{{ (data?.nodes ?? []).filter((node) => node.role === role).length }}</span>
    </button>

    <span v-if="data?.cycles.length" class="tag amber cycles">
      {{ data.cycles.length }} cycle{{ data.cycles.length === 1 ? '' : 's' }} detected
    </span>
  </div>

  <div class="canvas-wrap">
    <p v-if="error" class="error">{{ error }}</p>

    <svg
      ref="canvas"
      class="canvas"
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
      @pointerdown="onPointerDown($event, null)"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @wheel="onWheel"
      @click.self="selectedId = null"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="currentColor" />
        </marker>
      </defs>

      <g :transform="`translate(${view.x} ${view.y}) scale(${view.scale})`">
        <g class="edges">
          <line
            v-for="edge in visibleEdges"
            :key="`${edge.from}->${edge.to}:${edge.property}`"
            class="edge"
            :x1="placedById.get(edge.from)?.x ?? 0"
            :y1="placedById.get(edge.from)?.y ?? 0"
            :x2="placedById.get(edge.to)?.x ?? 0"
            :y2="placedById.get(edge.to)?.y ?? 0"
            :class="{
              optional: edge.optional,
              active: selectedId === edge.from || selectedId === edge.to,
              cycle: cycleIds.has(edge.from) && cycleIds.has(edge.to),
            }"
            :opacity="neighbours && !(neighbours.has(edge.from) && neighbours.has(edge.to)) ? 0.07 : undefined"
            marker-end="url(#arrow)"
          />
        </g>

        <g class="nodes">
          <g
            v-for="entry in placed" :key="entry.node.id"
            :transform="`translate(${entry.x} ${entry.y})`"
            :opacity="nodeOpacity(entry.node.id)"
            :class="[`node ${entry.node.role}`, { selected: selectedId === entry.node.id }]"
            @pointerdown.stop="onPointerDown($event, entry.node.id)"
            @click.stop="selectedId = entry.node.id"
          >
            <circle v-if="cycleIds.has(entry.node.id)" class="cycle" :r="entry.radius + 5" />
            <circle class="dot" :r="entry.radius" :class="{ idle: !entry.node.instantiated }" />
            <text class="label" :y="entry.radius + 13">{{ entry.node.name }}</text>
          </g>
        </g>
      </g>
    </svg>

    <aside v-if="selected" class="inspector panel">
      <header>
        <div>
          <span class="eyebrow">{{ selected.role }}</span>
          <h2 class="mono">{{ selected.name }}</h2>
        </div>
        <button class="btn" type="button" @click="selectedId = null">Close</button>
      </header>

      <div class="tags">
        <span class="tag">{{ selected.kind }}</span>
        <span class="tag" :class="selected.instantiated ? 'green' : ''">
          {{ selected.instantiated ? 'instantiated' : 'never resolved' }}
        </span>
        <span v-if="selected.symbol" class="tag">symbol key</span>
        <span v-if="selected.basePath" class="tag accent mono">{{ selected.basePath }}</span>
        <span v-if="selected.timing" class="tag teal">built in {{ formatMs(selected.timing.totalMs) }}</span>
      </div>

      <p v-if="selected.implementation" class="impl">
        bound to <code>{{ selected.implementation }}</code>
      </p>

      <section>
        <span class="eyebrow">injects ({{ selected.dependencies.length }})</span>
        <ul v-if="selected.dependencies.length" class="list">
          <li v-for="dependency in selected.dependencies" :key="dependency.property">
            <button class="link mono" type="button" :disabled="!dependency.bound" @click="selectedId = dependency.id">
              {{ dependency.name }}
            </button>
            <span class="meta mono">.{{ dependency.property }}</span>
            <span v-if="dependency.optional" class="tag">optional</span>
            <span v-if="!dependency.bound" class="tag red">unbound</span>
          </li>
        </ul>
        <p v-else class="muted">No dependencies.</p>
      </section>

      <section>
        <span class="eyebrow">injected into ({{ dependents.length }})</span>
        <ul v-if="dependents.length" class="list">
          <li v-for="dependent in dependents" :key="`${dependent.id}.${dependent.property}`">
            <button class="link mono" type="button" @click="selectedId = dependent.id">{{ dependent.id }}</button>
            <span class="meta mono">.{{ dependent.property }}</span>
          </li>
        </ul>
        <p v-else class="muted">Nothing depends on this service.</p>
      </section>
    </aside>

    <div v-else-if="!loading && visibleNodes.length" class="hint">Click a node to inspect it · drag to move · scroll to zoom</div>
  </div>
</template>

<style scoped>
.search {
  width: 200px;
}

.filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 9px 16px;
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-2);
  transition:
    opacity 0.12s,
    color 0.12s;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.count {
  color: var(--text-3);
}

.chip.off {
  opacity: 0.4;
}

.chip.controller {
  color: var(--role-controller);
}
.chip.middleware {
  color: var(--role-middleware);
}
.chip.service {
  color: var(--role-service);
}
.chip.plugin {
  color: var(--role-plugin);
}
.chip.framework {
  color: var(--text-3);
}
.chip.value {
  color: var(--role-value);
}

.cycles {
  margin-left: auto;
}

.canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

.canvas:active {
  cursor: grabbing;
}

.edges line {
  stroke: var(--edge);
  stroke-width: 1;
  color: var(--edge);
}

.edge.optional {
  stroke-dasharray: 3 4;
}

.edge.active {
  stroke: var(--brand);
  color: var(--brand);
  stroke-width: 1.6;
}

.edge.cycle {
  stroke: var(--warn);
  color: var(--warn);
}

.node {
  cursor: pointer;
  transition: opacity 0.18s;
}

.dot {
  fill: var(--role-service);
  stroke: var(--panel);
  stroke-width: 2;
}

.dot.idle {
  fill: var(--raised);
  stroke: var(--edge-strong);
}

.node.controller .dot {
  fill: var(--role-controller);
}
.node.middleware .dot {
  fill: var(--role-middleware);
}
.node.plugin .dot {
  fill: var(--role-plugin);
}
.node.framework .dot {
  fill: var(--text-3);
}
.node.value .dot {
  fill: var(--role-value);
}

.node.controller .dot.idle,
.node.middleware .dot.idle,
.node.plugin .dot.idle,
.node.framework .dot.idle,
.node.value .dot.idle {
  fill: var(--raised);
}

.cycle {
  fill: none;
  stroke: var(--warn);
  stroke-width: 1.2;
  stroke-dasharray: 2 3;
  opacity: 0.75;
}

.node.selected .dot {
  stroke: var(--brand);
  stroke-width: 3;
}

.label {
  fill: var(--text-2);
  font-family: var(--mono);
  font-size: 10.5px;
  text-anchor: middle;
  pointer-events: none;
}

.node.selected .label {
  fill: var(--text);
}

.inspector {
  backdrop-filter: blur(14px);
  background: color-mix(in srgb, var(--chassis) 82%, transparent);
  position: absolute;
  top: 14px;
  right: 14px;
  bottom: 14px;
  width: min(340px, 42vw);
  padding: 16px 18px;
  display: grid;
  gap: 14px;
  align-content: start;
  overflow: auto;
  box-shadow: var(--shadow);
}

.inspector header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.inspector header h2 {
  font-size: 16px;
  word-break: break-all;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.impl {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
}

.inspector section {
  display: grid;
  gap: 7px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 5px;
}

.list li {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: var(--panel-head);
  font-size: 12px;
}

.link {
  color: var(--brand-2);
}

.link:disabled {
  color: var(--text-3);
  cursor: default;
}

.meta {
  color: var(--text-3);
  font-size: 11px;
}

.muted {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--edge);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  color: var(--text-3);
  font-size: 11.5px;
  pointer-events: none;
}

.error {
  position: absolute;
  top: 16px;
  left: 26px;
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--err-tint);
  color: var(--err);
  font-family: var(--mono);
  font-size: 12px;
}
</style>
