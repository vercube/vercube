<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatMs, useResource } from '../api';
import PageHeader from './PageHeader.vue';
import type { BootstrapNode, BootstrapProfile } from '../api';

interface Row {
  node: BootstrapNode;
  depth: number;
  left: number;
  width: number;
}

const { data, error, loading, reload } = useResource<BootstrapProfile>('/api/bootstrap');

const hovered = ref<Row | null>(null);
const minimum = ref(0);

const rows = computed(() => {
  const profile = data.value;

  if (!profile || profile.totalMs <= 0) {
    return [];
  }

  const result: Row[] = [];

  const walk = (nodes: BootstrapNode[], depth: number): void => {
    for (const node of nodes) {
      if (node.totalMs < minimum.value) {
        continue;
      }

      result.push({
        node,
        depth,
        left: (node.offsetMs / profile.totalMs) * 100,
        width: Math.max(0.12, (node.totalMs / profile.totalMs) * 100),
      });

      walk(node.children, depth + 1);
    }
  };

  walk(profile.tree, 0);
  return result;
});

const depth = computed(() => levels(rows.value));

const hotspots = computed(() => (data.value?.hotspots ?? []).filter((entry) => entry.selfMs > 0).slice(0, 12));

const peak = computed(() => Math.max(0.001, ...hotspots.value.map((entry) => entry.selfMs)));

function levels(rows: Row[]): number {
  let deepest = 0;

  for (const row of rows) {
    if (row.depth > deepest) {
      deepest = row.depth;
    }
  }

  return deepest + 1;
}

const meta = computed(() => {
  const profile = data.value;

  if (!profile?.count) {
    return '';
  }

  return `${profile.count} instances in ${formatMs(profile.totalMs)}`;
});

onMounted(reload);
</script>

<template>
  <PageHeader title="Bootstrap" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <label class="threshold">
        <span class="eyebrow">Hide under</span>
        <input v-model.number="minimum" type="range" min="0" max="5" step="0.1" />
        <span class="mono">{{ minimum.toFixed(1) }}ms</span>
      </label>
    </template>
  </PageHeader>

  <div class="scroll body">
    <p v-if="error" class="error">{{ error }}</p>

    <div v-else-if="data && !data.available" class="notice panel">
      <strong>Partial profile.</strong>
      <p>
        Devtools attached after the container had already been built, so the earliest constructions were not observed. Register
        <code>DevtoolsPlugin</code> in the <code>plugins</code> array of <code>vercube.config.ts</code> to capture the whole
        bootstrap.
      </p>
    </div>

    <template v-if="data && data.count > 0">
      <section class="summary">
        <div class="stat">
          <span class="label">Total</span>
          <strong class="num">{{ formatMs(data.totalMs) }}</strong>
        </div>
        <div class="stat">
          <span class="label">Instances built</span>
          <strong class="num">{{ data.count }}</strong>
        </div>
        <div class="stat">
          <span class="label">Injection depth</span>
          <strong class="num">{{ depth }}</strong>
        </div>
        <div class="stat">
          <span class="label">Slowest</span>
          <strong class="mono slowest">{{ hotspots[0]?.name ?? '--' }}</strong>
        </div>
      </section>

      <section class="flame">
        <header class="surface-head">
          <span class="label">Construction flamegraph</span>
          <span class="faint legend">Width is total time · nesting is injection depth</span>
        </header>

        <div class="canvas" :style="{ height: `${depth * 22 + 6}px` }" @pointerleave="hovered = null">
          <div
            v-for="(row, index) in rows"
            :key="`${row.node.id}-${index}`"
            class="frame"
            :class="{ hot: row.node.selfMs > 5 }"
            :style="{ left: `${row.left}%`, width: `${row.width}%`, top: `${row.depth * 22}px` }"
            @pointerenter="hovered = row"
          >
            <span class="label mono">{{ row.node.name }}</span>
          </div>
        </div>

        <footer v-if="hovered" class="tip">
          <strong class="mono">{{ hovered.node.name }}</strong>
          <span class="tag">{{ hovered.node.kind }}</span>
          <span>total {{ formatMs(hovered.node.totalMs) }}</span>
          <span>self {{ formatMs(hovered.node.selfMs) }}</span>
          <span>at +{{ formatMs(hovered.node.offsetMs) }}</span>
          <span v-if="hovered.node.children.length">{{ hovered.node.children.length }} deps</span>
        </footer>
        <footer v-else class="tip idle">Point at a frame to see its timings.</footer>
      </section>

      <section class="hotspots">
        <header class="surface-head">
          <span class="label">Hotspots by self time</span>
          <span class="faint legend">Excludes time spent building dependencies</span>
        </header>

        <ol>
          <li v-for="entry in hotspots" :key="entry.id">
            <span class="name mono">{{ entry.name }}</span>
            <span class="track">
              <span class="bar" :style="{ width: `${(entry.selfMs / peak) * 100}%` }" />
            </span>
            <span class="value mono">{{ formatMs(entry.selfMs) }}</span>
          </li>
        </ol>
      </section>
    </template>

    <div v-else-if="!loading" class="empty">
      <span>No construction recorded.</span>
      <span>Register DevtoolsPlugin in vercube.config.ts to profile the bootstrap.</span>
    </div>
  </div>
</template>

<style scoped>
.threshold {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-2);
}

.threshold input {
  width: 90px;
  accent-color: var(--brand);
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.notice {
  margin: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
  border-radius: var(--radius-sm);
  background: var(--warn-tint);
}

.notice strong {
  color: var(--warn);
  font-size: 12.5px;
}

.notice p {
  margin: 5px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
}

.summary {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
}

.stat {
  padding: 12px 16px 14px;
  display: grid;
  gap: 5px;
}

.stat + .stat {
  border-left: 1px solid var(--edge);
}

.label {
  font-size: 11.5px;
  color: var(--text-3);
}

.stat strong {
  font-size: 21px;
  line-height: 1.1;
}

.slowest {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend {
  font-size: 11px;
}

.flame {
  flex: none;
  border-bottom: 1px solid var(--edge);
}

.hotspots {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.canvas {
  position: relative;
  width: 100%;
  margin: 14px 0 0;
  padding: 0 14px;
}

.frame {
  position: absolute;
  height: 19px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--brand) 24%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--brand) 42%, transparent);
  overflow: hidden;
  cursor: default;
  transition: background 0.1s ease;
}

.frame:hover {
  background: color-mix(in srgb, var(--brand) 52%, var(--panel));
}

.frame.hot {
  background: color-mix(in srgb, var(--warn) 26%, var(--panel));
  border-color: color-mix(in srgb, var(--warn) 46%, transparent);
}

.frame.hot:hover {
  background: color-mix(in srgb, var(--warn) 52%, var(--panel));
}

.label {
  display: block;
  padding: 2px 5px;
  font-size: 10px;
  line-height: 15px;
  white-space: nowrap;
  color: var(--text);
}

.tip {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  min-height: 36px;
  margin-top: 14px;
  padding: 0 14px;
  border-top: 1px solid var(--edge);
  padding-top: 10px;
  font-size: 11.5px;
  color: var(--text-2);
}

.tip.idle {
  color: var(--text-3);
}

.hotspots ol {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
  min-height: 0;
  background-image: repeating-linear-gradient(to bottom, var(--edge-soft) 0 1px, transparent 1px var(--row));
  background-attachment: local;
}

.hotspots li {
  display: grid;
  grid-template-columns: minmax(0, 220px) minmax(0, 1fr) 62px;
  align-items: center;
  gap: 14px;
  height: var(--row);
  padding: 0 16px;
}

.name {
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  height: 6px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.bar {
  display: block;
  height: 100%;
  background: var(--brand-2);
}

.value {
  font-size: 11px;
  color: var(--text-2);
  text-align: right;
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
</style>
