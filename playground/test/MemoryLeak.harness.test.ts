import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { setup } from '../src/Boot/Setup';
import type { App } from '@vercube/core';

type Scenario = 'single-app' | 'recreate-app' | 'both';

interface MemorySample {
  tag: string;
  index: number;
  rssMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
}

const RUN_ENABLED = process.env.LEAK_HARNESS === '1';
const REQUESTS = Number(process.env.LEAK_REQUESTS ?? '10000');
const CHECKPOINT_EVERY = Number(process.env.LEAK_CHECKPOINT_EVERY ?? '1000');
const WARMUP = Number(process.env.LEAK_WARMUP ?? '100');
const SCENARIO = (process.env.LEAK_SCENARIO ?? 'both') as Scenario;
const ROUTE = process.env.LEAK_ROUTE ?? 'http://localhost/not-found';
const EXPECTED_STATUS = Number(process.env.LEAK_EXPECTED_STATUS ?? '404');
const OUTPUT_FILE = process.env.LEAK_OUTPUT_FILE;

function toMB(bytes: number): number {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

async function forceGc(): Promise<void> {
  if (typeof globalThis.gc !== 'function') {
    return;
  }

  for (let i = 0; i < 3; i += 1) {
    globalThis.gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function sampleMemory(tag: string, index: number): MemorySample {
  const usage = process.memoryUsage();

  return {
    tag,
    index,
    rssMB: toMB(usage.rss),
    heapUsedMB: toMB(usage.heapUsed),
    heapTotalMB: toMB(usage.heapTotal),
    externalMB: toMB(usage.external),
    arrayBuffersMB: toMB(usage.arrayBuffers),
  };
}

function logSamples(name: string, samples: MemorySample[]): void {
  console.log(`\n[LeakHarness] ${name}`);
  console.table(samples);
}

function persistSamples(name: string, samples: MemorySample[]): void {
  if (!OUTPUT_FILE) {
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    scenario: name,
    config: {
      requests: REQUESTS,
      checkpointEvery: CHECKPOINT_EVERY,
      warmup: WARMUP,
      route: ROUTE,
      expectedStatus: EXPECTED_STATUS,
      gcAvailable: typeof globalThis.gc === 'function',
    },
    samples,
  };

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[LeakHarness] Samples written to ${OUTPUT_FILE}`);
}

async function runSilenced<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => {};

  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

async function createHarnessApp(): Promise<App> {
  return createApp({
    setup,
    cfg: { logLevel: 'error' },
  });
}

async function hitRoute(app: App): Promise<void> {
  const response = await app.fetch(new Request(ROUTE));
  if (response.status !== EXPECTED_STATUS) {
    const text = await response.text();
    throw new Error(`Unexpected status ${response.status} for ${ROUTE} (expected ${EXPECTED_STATUS}): ${text}`);
  }
}

async function runSingleAppScenario(): Promise<MemorySample[]> {
  const samples: MemorySample[] = [];
  const app = await createHarnessApp();

  for (let i = 0; i < WARMUP; i += 1) {
    await hitRoute(app);
  }

  await forceGc();
  samples.push(sampleMemory('single-app:start:post-gc', 0));

  for (let i = 1; i <= REQUESTS; i += 1) {
    await hitRoute(app);

    if (i % CHECKPOINT_EVERY === 0) {
      await forceGc();
      samples.push(sampleMemory('single-app:checkpoint:post-gc', i));
    }
  }

  await forceGc();
  samples.push(sampleMemory('single-app:end:post-gc', REQUESTS));

  return samples;
}

async function runRecreateAppScenario(): Promise<MemorySample[]> {
  const samples: MemorySample[] = [];

  for (let i = 0; i < WARMUP; i += 1) {
    const app = await createHarnessApp();
    await hitRoute(app);
  }

  await forceGc();
  samples.push(sampleMemory('recreate-app:start:post-gc', 0));

  for (let i = 1; i <= REQUESTS; i += 1) {
    const app = await createHarnessApp();
    await hitRoute(app);

    if (i % CHECKPOINT_EVERY === 0) {
      await forceGc();
      samples.push(sampleMemory('recreate-app:checkpoint:post-gc', i));
    }
  }

  await forceGc();
  samples.push(sampleMemory('recreate-app:end:post-gc', REQUESTS));

  return samples;
}

describe.sequential('[Diag] Memory Leak Harness', () => {
  it('runs reproducible memory checkpoints', async () => {
    if (!RUN_ENABLED) {
      console.log('[LeakHarness] Skipping. Set LEAK_HARNESS=1 to run.');
      return;
    }

    console.log('[LeakHarness] Configuration', {
      scenario: SCENARIO,
      requests: REQUESTS,
      checkpointEvery: CHECKPOINT_EVERY,
      warmup: WARMUP,
      route: ROUTE,
      expectedStatus: EXPECTED_STATUS,
      gcAvailable: typeof globalThis.gc === 'function',
    });

    if (SCENARIO === 'single-app' || SCENARIO === 'both') {
      const samples = await runSilenced(runSingleAppScenario);
      logSamples('single-app', samples);
      persistSamples('single-app', samples);
    }

    if (SCENARIO === 'recreate-app' || SCENARIO === 'both') {
      const samples = await runSilenced(runRecreateAppScenario);
      logSamples('recreate-app', samples);
      persistSamples('recreate-app', samples);
    }

    expect(true).toBe(true);
  }, 0);
});
