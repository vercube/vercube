import { describe, expect, it } from 'vitest';
import { stub, TestingError } from '../../src';

class UserRepository {
  public table: string = 'users';

  public async findById(id: string): Promise<{ id: string }> {
    return { id };
  }

  public async save(): Promise<void> {}
}

describe('stub', () => {
  it('should answer with what the partial defines', async () => {
    const repo = stub<UserRepository>({ findById: async (id) => ({ id: `stub-${id}` }) }, 'UserRepository');

    expect(await repo.findById('1')).toEqual({ id: 'stub-1' });
  });

  it('should name the class and the method that is not stubbed', () => {
    const repo = stub<UserRepository>({}, 'UserRepository');

    expect(() => repo.save()).toThrow(TestingError);
    expect(() => repo.save()).toThrow('UserRepository.save is not stubbed');
  });

  it('should not look like a promise', async () => {
    const repo = stub<UserRepository>({}, 'UserRepository');

    expect(await repo).toBe(repo);
    expect((repo as unknown as { then: unknown }).then).toBeUndefined();
  });

  it('should keep the values it was given', () => {
    const repo = stub<UserRepository>({ table: 'accounts' });

    expect(repo.table).toBe('accounts');
    expect('table' in repo).toBe(true);
    expect('missing' in repo).toBe(false);
  });

  it('should print without throwing', () => {
    const repo = stub<UserRepository>({ table: 'accounts' });

    expect(JSON.stringify(repo)).toBe('{"table":"accounts"}');
    expect(String(repo)).toBe('[object Object]');
  });
});
