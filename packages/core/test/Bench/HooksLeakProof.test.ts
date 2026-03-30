import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'vitest';
import { HooksService } from '../../src';

type Point = {
  iteration: number;
  mapSize: number;
  heapUsedMB: number;
};

type RunResult = {
  iterations: number;
  durationMs: number;
  points: Point[];
  finalMapSize: number;
  heapDeltaMB: number;
};

const ARTIFACTS_DIR = resolve(process.cwd(), 'playground', 'artifacts');
const FIXED_ITERATIONS = 2000;

function maybeGc(): void {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
}

function runScenario(iterations: number): RunResult {
  const hooks = new HooksService();
  const points: Point[] = [];
  const sampleEvery = Math.max(1, Math.floor(iterations / 40));

  maybeGc();
  const heapBefore = process.memoryUsage().heapUsed / 1024 / 1024;
  const started = performance.now();

  for (let i = 1; i <= iterations; i += 1) {
    class DynamicHook {}
    const hookId = hooks.on(DynamicHook, () => {});
    hooks.off(hookId);

    if (i % sampleEvery === 0 || i === 1 || i === iterations) {
      maybeGc();
      points.push({
        iteration: i,
        mapSize: (hooks as any).fHandlers.size,
        heapUsedMB: process.memoryUsage().heapUsed / 1024 / 1024,
      });
    }
  }

  maybeGc();
  const heapAfter = process.memoryUsage().heapUsed / 1024 / 1024;
  const durationMs = performance.now() - started;

  return {
    iterations,
    durationMs,
    points,
    finalMapSize: (hooks as any).fHandlers.size,
    heapDeltaMB: heapAfter - heapBefore,
  };
}

function toFixed2(value: number): string {
  return Number(value).toFixed(2);
}

function toFixed3(value: number): string {
  return Number(value).toFixed(3);
}

function makeTicks(min: number, max: number, count: number): number[] {
  if (count <= 1 || max <= min) {
    return [min];
  }

  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

function buildPath(points: Point[], getX: (point: Point) => number, getY: (point: Point) => number): string {
  const coords = points.map((point, index) => {
    const x = getX(point);
    const y = getY(point);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  return coords.join(' ');
}

function writeSvg(phase: 'before' | 'after', result: RunResult): void {
  const width = 1320;
  const height = 920;
  const paddingLeft = 120;
  const paddingRight = 50;
  const topA = 130;
  const topB = 520;
  const plotW = width - paddingLeft - paddingRight;
  const plotH = 260;

  const maxIteration = result.iterations;
  const maxMapSize = Math.max(...result.points.map((p) => p.mapSize), 1);
  const heapMin = Math.min(...result.points.map((p) => p.heapUsedMB));
  const heapMax = Math.max(...result.points.map((p) => p.heapUsedMB), heapMin + 0.001);

  const scaleX = (iteration: number) => paddingLeft + (iteration / maxIteration) * plotW;
  const scaleMapY = (mapSize: number) => topA + plotH - (mapSize / maxMapSize) * plotH;
  const scaleHeapY = (heap: number) => topB + plotH - ((heap - heapMin) / (heapMax - heapMin)) * plotH;

  const mapPath = buildPath(
    result.points,
    (p) => scaleX(p.iteration),
    (p) => scaleMapY(p.mapSize),
  );
  const heapPath = buildPath(
    result.points,
    (p) => scaleX(p.iteration),
    (p) => scaleHeapY(p.heapUsedMB),
  );

  const xTicks = makeTicks(0, maxIteration, 6);
  const mapTicks = makeTicks(0, maxMapSize, 6);
  const heapTicks = makeTicks(heapMin, heapMax, 6);

  const mapGrid = mapTicks
    .map((v) => {
      const y = scaleMapY(v);
      return `<line class="grid" x1="${paddingLeft}" y1="${y.toFixed(2)}" x2="${(paddingLeft + plotW).toFixed(2)}" y2="${y.toFixed(2)}" />`;
    })
    .join('\n');

  const mapYLabels = mapTicks
    .map((v) => {
      const y = scaleMapY(v);
      return `<text class="tick" x="${paddingLeft - 10}" y="${(y + 5).toFixed(2)}" text-anchor="end">${Math.round(v).toLocaleString()}</text>`;
    })
    .join('\n');

  const mapXGrid = xTicks
    .map((v) => {
      const x = scaleX(v);
      return `<line class="grid" x1="${x.toFixed(2)}" y1="${topA}" x2="${x.toFixed(2)}" y2="${topA + plotH}" />`;
    })
    .join('\n');

  const mapXLabels = xTicks
    .map((v) => {
      const x = scaleX(v);
      return `<text class="tick" x="${x.toFixed(2)}" y="${topA + plotH + 24}" text-anchor="middle">${Math.round(v).toLocaleString()}</text>`;
    })
    .join('\n');

  const heapGrid = heapTicks
    .map((v) => {
      const y = scaleHeapY(v);
      return `<line class="grid" x1="${paddingLeft}" y1="${y.toFixed(2)}" x2="${(paddingLeft + plotW).toFixed(2)}" y2="${y.toFixed(2)}" />`;
    })
    .join('\n');

  const heapYLabels = heapTicks
    .map((v) => {
      const y = scaleHeapY(v);
      return `<text class="tick" x="${paddingLeft - 10}" y="${(y + 5).toFixed(2)}" text-anchor="end">${toFixed3(v)}</text>`;
    })
    .join('\n');

  const heapXGrid = xTicks
    .map((v) => {
      const x = scaleX(v);
      return `<line class="grid" x1="${x.toFixed(2)}" y1="${topB}" x2="${x.toFixed(2)}" y2="${topB + plotH}" />`;
    })
    .join('\n');

  const heapXLabels = xTicks
    .map((v) => {
      const x = scaleX(v);
      return `<text class="tick" x="${x.toFixed(2)}" y="${topB + plotH + 24}" text-anchor="middle">${Math.round(v).toLocaleString()}</text>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .title { font: 700 30px sans-serif; fill: #1f2937; }
    .subtitle { font: 500 16px sans-serif; fill: #374151; }
    .chart-title { font: 700 18px sans-serif; fill: #111827; }
    .label { font: 600 14px sans-serif; fill: #374151; }
    .tick { font: 500 12px sans-serif; fill: #4b5563; }
    .axis { stroke: #6b7280; stroke-width: 1.4; }
    .grid { stroke: #e5e7eb; stroke-width: 1; }
    .series-map { fill: none; stroke: #dc2626; stroke-width: 3; }
    .series-heap { fill: none; stroke: #2563eb; stroke-width: 3; }
    .note { font: 600 13px sans-serif; fill: #111827; }
    .panel { fill: #fafafa; stroke: #e5e7eb; stroke-width: 1; }
  </style>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  <text class="title" x="${paddingLeft}" y="52">HooksService leak evidence - ${phase.toUpperCase()}</text>
  <text class="subtitle" x="${paddingLeft}" y="80">Iterations: ${result.iterations.toLocaleString()} | Duration: ${toFixed2(result.durationMs)} ms | Samples: ${result.points.length}</text>
  <line x1="${paddingLeft}" y1="98" x2="${paddingLeft + 56}" y2="98" class="series-map" />
  <text class="label" x="${paddingLeft + 64}" y="103">fHandlers.size</text>
  <line x1="${paddingLeft + 210}" y1="98" x2="${paddingLeft + 266}" y2="98" class="series-heap" />
  <text class="label" x="${paddingLeft + 274}" y="103">heap used (MB)</text>

  <rect class="panel" x="${paddingLeft}" y="${topA}" width="${plotW}" height="${plotH}" />
  <text class="chart-title" x="${paddingLeft}" y="${topA - 16}">Chart A: Handler map size over iterations</text>
  ${mapGrid}
  ${mapXGrid}
  <line class="axis" x1="${paddingLeft}" y1="${topA}" x2="${paddingLeft}" y2="${topA + plotH}" />
  <line class="axis" x1="${paddingLeft}" y1="${topA + plotH}" x2="${paddingLeft + plotW}" y2="${topA + plotH}" />
  ${mapYLabels}
  ${mapXLabels}
  <path class="series-map" d="${mapPath}" />
  <text class="label" x="${paddingLeft + plotW / 2}" y="${topA + plotH + 48}" text-anchor="middle">Iteration</text>
  <text class="label" x="${paddingLeft - 84}" y="${topA + plotH / 2}" transform="rotate(-90 ${paddingLeft - 84} ${topA + plotH / 2})" text-anchor="middle">fHandlers.size (count)</text>
  <text class="note" x="${paddingLeft + 12}" y="${topA + 22}">start: ${result.points[0]?.mapSize ?? 0} | end: ${result.finalMapSize.toLocaleString()}</text>

  <rect class="panel" x="${paddingLeft}" y="${topB}" width="${plotW}" height="${plotH}" />
  <text class="chart-title" x="${paddingLeft}" y="${topB - 16}">Chart B: Heap usage over iterations</text>
  ${heapGrid}
  ${heapXGrid}
  <line class="axis" x1="${paddingLeft}" y1="${topB}" x2="${paddingLeft}" y2="${topB + plotH}" />
  <line class="axis" x1="${paddingLeft}" y1="${topB + plotH}" x2="${paddingLeft + plotW}" y2="${topB + plotH}" />
  ${heapYLabels}
  ${heapXLabels}
  <path class="series-heap" d="${heapPath}" />
  <text class="label" x="${paddingLeft + plotW / 2}" y="${topB + plotH + 48}" text-anchor="middle">Iteration</text>
  <text class="label" x="${paddingLeft - 84}" y="${topB + plotH / 2}" transform="rotate(-90 ${paddingLeft - 84} ${topB + plotH / 2})" text-anchor="middle">Heap used (MB)</text>
  <text class="note" x="${paddingLeft + 12}" y="${topB + 22}">heap delta: ${toFixed3(result.heapDeltaMB)} MB</text>

  <text class="subtitle" x="${paddingLeft}" y="${height - 28}">Scale note: Chart A Y-axis starts at 0; Chart B Y-axis spans measured min..max for this run.</text>
</svg>
`;

  writeFileSync(resolve(ARTIFACTS_DIR, `hooks-leak-${phase}.svg`), svg, 'utf8');
}

describe('[Leak proof] HooksService off() cleanup', () => {
  it('generates reproducible SVG evidence', () => {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });

    const phase = (process.env.HOOKS_LEAK_PHASE ?? 'before') as 'before' | 'after';
    const result = runScenario(FIXED_ITERATIONS);
    writeSvg(phase, result);
    writeFileSync(resolve(ARTIFACTS_DIR, `hooks-leak-${phase}.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  });
});
