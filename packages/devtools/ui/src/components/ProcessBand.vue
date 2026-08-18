<script setup lang="ts">
import { computed } from 'vue';
import { formatBytes } from '../api';
import type { MetricsSample } from '../api';

const props = defineProps<{ samples: MetricsSample[] }>();

const latest = computed(() => props.samples.at(-1) ?? null);

const WIDTH = 100;
const HEIGHT = 26;

function spark(values: number[], ceiling: number | null = null): { line: string; area: string } {
  if (values.length < 2) {
    return { line: '', area: '' };
  }

  const top = Math.max(ceiling ?? 0, ...values) || 1;
  const step = WIDTH / (values.length - 1);

  const points = values.map((value, index) => ({
    x: index * step,
    y: HEIGHT - Math.min(1, value / top) * HEIGHT,
  }));

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

  return { line, area: `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z` };
}

const cpu = computed(() => {
  const values = props.samples.map((sample) => sample.cpu?.total ?? 0);

  return { ...spark(values, 10), current: latest.value?.cpu ?? null };
});

const heap = computed(() => {
  const values = props.samples.map((sample) => sample.memory.heapUsed);
  const memory = latest.value?.memory ?? null;

  return {
    ...spark(values, memory?.heapTotal ?? null),
    memory,
    percent: memory ? Math.round((memory.heapUsed / memory.heapTotal) * 100) : 0,
  };
});

const loop = computed(() => {
  const values = props.samples.map((sample) => sample.loop?.meanMs ?? 0);
  return { ...spark(values), current: latest.value?.loop ?? null };
});

const loopTone = computed(() => {
  const delay = latest.value?.loop?.p99Ms ?? 0;

  if (delay >= 100) {
    return 'bad';
  }

  return delay >= 30 ? 'warn' : '';
});
</script>

<template>
  <section class="band">
    <div class="cell">
      <div class="head">
        <span class="label">CPU</span>
        <span class="faint note">
          <template v-if="cpu.current"> {{ cpu.current.user }}% user · {{ cpu.current.system }}% sys </template>
          <template v-else>not measurable here</template>
        </span>
      </div>

      <div class="body">
        <strong class="num value">{{ cpu.current ? `${cpu.current.total}%` : '--' }}</strong>
        <svg class="spark" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
          <path :d="cpu.area" class="area" />
          <path :d="cpu.line" class="line" fill="none" vector-effect="non-scaling-stroke" />
        </svg>
      </div>
    </div>

    <div class="cell">
      <div class="head">
        <span class="label">Heap</span>
        <span class="faint note">
          <template v-if="heap.memory">
            {{ formatBytes(heap.memory.rss) }} rss
            <template v-if="heap.memory.heapLimit"> · {{ formatBytes(heap.memory.heapLimit) }} limit</template>
          </template>
        </span>
      </div>

      <div class="body">
        <strong class="num value">{{ heap.memory ? formatBytes(heap.memory.heapUsed) : '--' }}</strong>
        <svg class="spark" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
          <path :d="heap.area" class="area" />
          <path :d="heap.line" class="line" fill="none" vector-effect="non-scaling-stroke" />
        </svg>
      </div>
    </div>

    <div class="cell">
      <div class="head">
        <span class="label">Event loop</span>
        <span class="faint note">
          <template v-if="loop.current"> p99 {{ loop.current.p99Ms }}ms · {{ loop.current.utilization }}% busy </template>
          <template v-else>not measurable here</template>
        </span>
      </div>

      <div class="body">
        <strong class="value" :class="loopTone">
          {{ loop.current ? `${loop.current.meanMs}ms` : '--' }}
        </strong>
        <svg class="spark" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
          <path :d="loop.area" class="area" />
          <path :d="loop.line" class="line" fill="none" vector-effect="non-scaling-stroke" />
        </svg>
      </div>
    </div>

    <div class="cell">
      <div class="head">
        <span class="label">Handles</span>
        <span class="faint note">keeping the process alive</span>
      </div>

      <div class="body list">
        <strong class="num value">{{ latest?.resources?.total ?? '--' }}</strong>

        <ul v-if="latest?.resources" class="kinds">
          <li v-for="(count, kind) in latest.resources.kinds" :key="kind">
            <span class="faint">{{ kind }}</span>
            <span class="mono">{{ count }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.band {
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
}

.cell {
  display: grid;
  gap: 8px;
  padding: 12px 16px 14px;
  min-width: 0;
}

.cell + .cell {
  border-left: 1px solid var(--edge);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.note {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.body {
  display: flex;
  align-items: flex-end;
  gap: 14px;
}

.value {
  font-size: 22px;
  line-height: 1;
  flex: none;
}

.value.warn {
  color: var(--warn);
}

.value.bad {
  color: var(--err);
}

.spark {
  flex: 1;
  min-width: 0;
  height: 30px;
  display: block;
}

.line {
  stroke: var(--chart-line);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.area {
  fill: color-mix(in srgb, var(--chart-line) 14%, transparent);
}

.body.list {
  align-items: center;
}

.kinds {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-size: 11px;
  min-width: 0;
}

.kinds li {
  display: flex;
  gap: 6px;
}

@media (max-width: 1100px) {
  .band {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cell:nth-child(3) {
    border-left: none;
  }

  .cell:nth-child(n + 3) {
    border-top: 1px solid var(--edge);
  }
}
</style>
