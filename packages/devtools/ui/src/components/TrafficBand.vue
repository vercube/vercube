<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatMs } from '../api';
import type { RequestRecord } from '../api';

const props = withDefaults(defineProps<{ records: RequestRecord[]; buckets?: number }>(), { buckets: 34 });

const MIN_SPAN_MS = 60_000;

const MAX_SPAN_MS = 10 * 60_000;

const now = ref(Date.now());
let timer = 0;

const hovered = ref<number | null>(null);

interface Bucket {
  at: number;
  ok: number;
  warn: number;
  err: number;
  total: number;
  peakMs: number;
}

const series = computed<Bucket[]>(() => {
  const records = props.records;

  if (records.length === 0) {
    return [];
  }

  const oldest = Math.min(...records.map((record) => record.startedAt));
  const span = Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, now.value - oldest));
  const end = now.value;
  const start = end - span;
  const width = span / props.buckets;

  const buckets: Bucket[] = Array.from({ length: props.buckets }, (_, index) => ({
    at: start + index * width,
    ok: 0,
    warn: 0,
    err: 0,
    total: 0,
    peakMs: 0,
  }));

  for (const record of records) {
    const index = Math.floor((record.startedAt - start) / width);

    if (index < 0 || index >= buckets.length) {
      continue;
    }

    const bucket = buckets[index];
    bucket.total++;
    bucket.peakMs = Math.max(bucket.peakMs, record.durationMs);

    if (record.status >= 500) {
      bucket.err++;
    } else if (record.status >= 400) {
      bucket.warn++;
    } else {
      bucket.ok++;
    }
  }

  return buckets;
});

const busiest = computed(() => Math.max(1, ...series.value.map((bucket) => bucket.total)));
const slowest = computed(() => Math.max(1, ...series.value.map((bucket) => bucket.peakMs)));

const totals = computed(() => ({
  ok: series.value.reduce((sum, bucket) => sum + bucket.ok, 0),
  warn: series.value.reduce((sum, bucket) => sum + bucket.warn, 0),
  err: series.value.reduce((sum, bucket) => sum + bucket.err, 0),
}));

const span = computed(() => {
  const first = series.value[0];

  if (!first) {
    return '';
  }

  const minutes = Math.round((now.value - first.at) / 60_000);
  return minutes >= 1 ? `last ${minutes} min` : 'last minute';
});

const shown = computed(() => (hovered.value === null ? null : (series.value[hovered.value] ?? null)));

const WIDTH = 100;
const HEIGHT = 34;

const step = computed(() => WIDTH / Math.max(1, series.value.length));

const barWidth = computed(() => Math.max(0.6, step.value - 0.9));

function segment(x: number, y: number, height: number): string {
  return `M${x} ${y} h${barWidth.value} v${height} h${-barWidth.value} Z`;
}

const bars = computed(() =>
  series.value.map((bucket, index) => {
    const x = index * step.value + (step.value - barWidth.value) / 2;
    const scale = HEIGHT / busiest.value;
    const parts: { key: string; path: string; tone: string }[] = [];

    let cursor = HEIGHT;

    const stack: [string, number][] = [
      ['ok', bucket.ok],
      ['warn', bucket.warn],
      ['err', bucket.err],
    ];
    const top = stack.findLast(([, count]) => count > 0)?.[0];

    for (const [tone, count] of stack) {
      if (count === 0) {
        continue;
      }

      const raw = count * scale;
      const height = Math.max(0.7, raw - (tone === top ? 0 : 0.35));
      cursor -= raw;
      parts.push({ key: tone, path: segment(x, cursor, height), tone });
    }

    return { index, x, parts, bucket };
  }),
);

const latency = computed(() => {
  const points = series.value.map((bucket, index) => ({
    x: index * step.value + step.value / 2,
    y: HEIGHT - (bucket.peakMs / slowest.value) * HEIGHT,
    empty: bucket.total === 0,
  }));

  const runs: (typeof points)[] = [];
  let run: typeof points = [];

  for (const point of points) {
    if (point.empty) {
      if (run.length > 0) {
        runs.push(run);
        run = [];
      }

      continue;
    }

    run.push(point);
  }

  if (run.length > 0) {
    runs.push(run);
  }

  const line = runs
    .map((segment) => segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' '))
    .join(' ');

  const dots = runs.filter((segment) => segment.length === 1).map((segment) => segment[0]);

  const area = runs
    .filter((segment) => segment.length > 1)
    .map(
      (segment) =>
        `${segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')} ` +
        `L${segment.at(-1)!.x} ${HEIGHT} L${segment[0].x} ${HEIGHT} Z`,
    )
    .join(' ');

  return { line, area, dots, points };
});

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

onMounted(() => {
  timer = globalThis.setInterval(() => (now.value = Date.now()), 5000);
});

onBeforeUnmount(() => globalThis.clearInterval(timer));
</script>

<template>
  <section class="band">
    <figure class="chart">
      <figcaption class="head">
        <span class="label">Throughput</span>
        <span class="faint span">{{ span }}</span>
      </figcaption>

      <div v-if="series.length === 0" class="empty">No traffic recorded yet.</div>

      <template v-else>
        <svg
          class="plot"
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`Requests per bucket over the ${span}`"
          @pointerleave="hovered = null"
        >
          <g v-for="bar in bars" :key="bar.index">
            <path
              v-for="part in bar.parts"
              :key="part.key"
              :d="part.path"
              class="fill"
              :class="part.tone"
              vector-effect="non-scaling-stroke"
            />
            
            <rect
              :x="bar.index * step"
              y="0"
              :width="step"
              :height="HEIGHT"
              fill="transparent"
              @pointerenter="hovered = bar.index"
            />
          </g>
        </svg>

        <div class="axis">
          <span class="mono">{{ formatClock(series[0].at) }}</span>
          <span class="mono">{{ formatClock(series[series.length - 1].at) }}</span>
        </div>

        
        <ul class="legend">
          <li>
            <span class="swatch ok" />2xx–3xx <b class="mono">{{ totals.ok }}</b>
          </li>
          <li>
            <span class="swatch warn" />4xx <b class="mono">{{ totals.warn }}</b>
          </li>
          <li>
            <span class="swatch err" />5xx <b class="mono">{{ totals.err }}</b>
          </li>
        </ul>
      </template>
    </figure>

    <figure class="chart latency">
      <figcaption class="head">
        <span class="label">Peak latency</span>
        <span class="faint span">{{ shown ? formatClock(shown.at) : formatMs(slowest) }} max</span>
      </figcaption>

      <div v-if="series.length === 0" class="empty">Nothing to measure yet.</div>

      <template v-else>
        <svg
          class="plot"
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`Slowest request per bucket over the ${span}`"
          @pointerleave="hovered = null"
        >
          <path :d="latency.area" class="area" />
          <path :d="latency.line" class="line" vector-effect="non-scaling-stroke" fill="none" />
          
          <rect
            v-for="dot in latency.dots"
            :key="dot.x"
            :x="dot.x - 0.5"
            :y="dot.y - 0.5"
            width="1"
            height="1"
            class="dot"
          />
          <line
            v-if="shown && shown.total > 0"
            :x1="latency.points[hovered!].x"
            y1="0"
            :x2="latency.points[hovered!].x"
            :y2="HEIGHT"
            class="cursor"
            vector-effect="non-scaling-stroke"
          />
          <rect
            v-for="bar in bars" :key="bar.index"
            :x="bar.index * step"
            y="0"
            :width="step"
            :height="HEIGHT"
            fill="transparent"
            @pointerenter="hovered = bar.index"
          />
        </svg>

        <div class="axis">
          <span class="mono">{{ formatClock(series[0].at) }}</span>
          <span class="mono">{{ formatClock(series[series.length - 1].at) }}</span>
        </div>

        <p class="readout">
          <template v-if="shown">
            <span class="mono">{{ shown.total }}</span> req ·
            <span class="mono">{{ shown.peakMs > 0 ? formatMs(shown.peakMs) : '--' }}</span> peak ·
            <span class="faint">{{ formatClock(shown.at) }}</span>
          </template>
          <span v-else class="faint">Point at a bucket for its numbers.</span>
        </p>
      </template>
    </figure>
  </section>
</template>

<style scoped>
.band {
  flex: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
}

.chart {
  margin: 0;
  padding: 12px 16px 10px;
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
}

.chart.latency {
  border-left: 1px solid var(--edge);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.span {
  font-size: 11px;
}

.plot {
  width: 100%;
  height: 62px;
  display: block;
  overflow: visible;
}

.empty {
  height: 62px;
  display: grid;
  align-items: center;
  font-size: 12px;
  color: var(--text-3);
}

.fill.ok {
  fill: var(--chart-ok);
}

.fill.warn {
  fill: var(--chart-warn);
}

.fill.err {
  fill: var(--chart-err);
}

.line {
  stroke: var(--chart-line);
  stroke-width: 2;
  stroke-linejoin: round;
}

.area {
  fill: color-mix(in srgb, var(--chart-line) 16%, transparent);
}

.dot {
  fill: var(--chart-line);
}

.cursor {
  stroke: var(--text-3);
  stroke-width: 1;
  stroke-dasharray: 2 2;
}

.axis {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--text-3);
  border-top: 1px solid var(--edge-soft);
  padding-top: 5px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: var(--text-2);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend b {
  font-weight: 500;
  color: var(--text);
}

.swatch {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-sm);
  flex: none;
}

.swatch.ok {
  background: var(--chart-ok);
}

.swatch.warn {
  background: var(--chart-warn);
}

.swatch.err {
  background: var(--chart-err);
}

.readout {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-2);
}

@media (max-width: 900px) {
  .band {
    grid-template-columns: minmax(0, 1fr);
  }

  .chart.latency {
    border-left: none;
    border-top: 1px solid var(--edge);
  }
}
</style>
