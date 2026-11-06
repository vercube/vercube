import { Container, initializeContainer } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { Storage, StorageManager } from '../src';
import { MemoryStorage } from '../src/Drivers/MemoryStorage';
import { S3Storage } from '../src/Drivers/S3Storage';
import type { StorageTypes } from '../src/Types/StorageTypes';

type Registered = Parameters<StorageTypes.HealthRegistryLike['register']>[0];

/** Stands in for `app.health`, which core binds under the same string key. */
class FakeHealth implements StorageTypes.HealthRegistryLike {
  public checks: Map<string, Registered> = new Map();

  public register(check: Registered): () => void {
    this.checks.set(check.name, check);

    return () => {
      if (this.checks.get(check.name) === check) {
        this.checks.delete(check.name);
      }
    };
  }
}

class PingStorage extends MemoryStorage {
  public reachable = true;

  public async ping(): Promise<void> {
    if (!this.reachable) {
      throw new Error('ECONNREFUSED');
    }
  }
}

function setup(withHealth = true): { manager: StorageManager; health: FakeHealth } {
  const container = new Container();
  const health = new FakeHealth();

  container.bindInstance(Container, container);

  if (withHealth) {
    container.bindInstance('vercube:health', health);
  }

  container.bind(StorageManager);
  container.bind(Storage);
  initializeContainer(container);

  return { manager: container.get(StorageManager), health };
}

describe('StorageManager health', () => {
  it('should register a check for a driver with a backend', async () => {
    const { manager, health } = setup();

    await manager.mount({ name: 'uploads', storage: PingStorage });
    await manager.mount({ name: 'memory', storage: MemoryStorage });

    expect([...health.checks.keys()]).toEqual(['storage:uploads']);
    expect(health.checks.get('storage:uploads')).toMatchObject({ critical: true });
    await expect(health.checks.get('storage:uploads')!.check()).resolves.toBeUndefined();
  });

  it('should fail the check when the backend does not answer', async () => {
    const { manager, health } = setup();

    await manager.mount({ name: 'uploads', storage: PingStorage });
    (manager.getStorage('uploads') as PingStorage).reachable = false;

    await expect(health.checks.get('storage:uploads')!.check()).rejects.toThrow('ECONNREFUSED');
  });

  it('should fail the check of a mount that failed to initialize', async () => {
    class Broken extends PingStorage {
      public override initialize(): void {
        throw new Error('bad credentials');
      }
    }

    const { manager, health } = setup();

    await manager.mount({ name: 'uploads', storage: Broken }).catch(() => undefined);

    await expect(health.checks.get('storage:uploads')!.check()).rejects.toThrow('Failed to initialize storage "uploads"');
  });

  it('should honour health: false and the options', async () => {
    const { manager, health } = setup();

    await manager.mount({ name: 'off', storage: PingStorage, health: false });
    await manager.mount({ name: 'soft', storage: PingStorage, health: { critical: false, timeout: 50 } });

    expect([...health.checks.keys()]).toEqual(['storage:soft']);
    expect(health.checks.get('storage:soft')).toMatchObject({ critical: false, timeout: 50 });
  });

  it('should replace the check when a name is mounted again', async () => {
    const { manager, health } = setup();

    await manager.mount({ name: 'uploads', storage: PingStorage });
    await manager.mount({ name: 'uploads', storage: MemoryStorage });

    expect(health.checks.size).toBe(0);
  });

  it('should work without a health registry', async () => {
    const { manager } = setup(false);

    await expect(manager.mount({ name: 'uploads', storage: PingStorage })).resolves.toBeUndefined();
    await expect(manager.ping('uploads')).resolves.toBeUndefined();
  });

  it('should report an unreachable S3 endpoint', async () => {
    const { manager, health } = setup();

    await manager.mount({
      name: 's3',
      storage: S3Storage,
      initOptions: {
        bucket: 'uploads',
        region: 'us-east-1',
        endpoint: 'http://127.0.0.1:1',
        forcePathStyle: true,
        maxAttempts: 1,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      },
    });

    await expect(health.checks.get('storage:s3')!.check()).rejects.toThrow();
  });
});
