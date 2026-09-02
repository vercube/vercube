import { Container } from '@vercube/di';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/Drivers/MemoryStorage';
import { StorageManager } from '../src/Service/StorageManager';
import type { TestTelemetry } from '@vercube/telemetry/testing';

let container: Container;
let storage: StorageManager;
let telemetry: TestTelemetry;

describe('storage instrumentation', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    container = new Container();
    container.bind(StorageManager);
    storage = container.get(StorageManager);
    await storage.mount({ storage: MemoryStorage });
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await telemetry.shutdown();
  });

  it('traces a read', async () => {
    await storage.getItem({ key: 'missing' });

    const span = telemetry.span('storage.getItem');

    expect(span).toBeDefined();
    expect(span!.attributes).toMatchObject({
      'vercube.storage.operation': 'getItem',
      'vercube.storage.mount': 'default',
      'vercube.storage.driver': 'MemoryStorage',
    });
  });

  it('traces a write', async () => {
    await storage.setItem({ key: 'user', value: { id: 1 } });

    expect(telemetry.span('storage.setItem')).toBeDefined();
  });

  it('never puts the key on the span', async () => {
    await storage.getItem({ key: 'tenants/acme/session-token' });

    const span = telemetry.span('storage.getItem')!;

    // Keys routinely carry user and tenant identifiers, so only the fact that
    // one was involved is recorded.
    expect(JSON.stringify(span.attributes)).not.toContain('acme');
    expect(span.attributes['vercube.storage.keyed']).toBe(true);
  });

  it('awaits the write before resolving', async () => {
    await storage.setItem({ key: 'awaited', value: 'value' });

    await expect(storage.getItem({ key: 'awaited' })).resolves.toBe('value');
  });
});
