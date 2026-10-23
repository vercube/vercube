import { Controller, Get } from '@vercube/core';
import { createTestApp } from '@vercube/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth, User } from '../src';
import { AuthProvider } from '../src/Services/AuthProvider';
import type { AuthTypes } from '../src/Types/AuthTypes';

interface Account {
  id: string;
  provider: string;
}

/** Stands in for the database both provider methods would query. */
const loadAccount = vi.fn((provider: string, request: Request): Account | null => {
  const id = request.headers.get('x-user');
  return id ? { id, provider } : null;
});

/**
 * Loads the account from the "database" in both methods, like a real provider would.
 */
class AccountAuthProvider extends AuthProvider<Account> {
  protected readonly name: string = 'default';

  public validate(request: Request): AuthTypes.ValidationResult<Account> {
    const user = loadAccount(this.name, request);
    return user ? { user } : { error: 'Unknown user' };
  }

  public getCurrentUser(request: Request): Account | null {
    return loadAccount(this.name, request);
  }
}

class OtherAuthProvider extends AccountAuthProvider {
  protected override readonly name: string = 'other';
}

/**
 * Written against the contract before `ValidationResult`: an error message, or null on success.
 */
class LegacyAuthProvider extends AuthProvider<Account> {
  public validate(request: Request): string | null {
    return loadAccount('legacy', request) ? null : 'Unknown user';
  }

  public getCurrentUser(request: Request): Account | null {
    return loadAccount('legacy', request);
  }
}

@Controller('/accounts')
class AccountController {
  @Get('/me')
  @Auth()
  public me(@User() user: Account): unknown {
    return user;
  }

  @Get('/public')
  public anonymous(@User() user: Account | null): unknown {
    return { user };
  }

  @Get('/other')
  @Auth()
  public other(@User({ provider: OtherAuthProvider }) user: Account): unknown {
    return user;
  }

  @Get('/legacy')
  @Auth({ provider: LegacyAuthProvider })
  public legacy(@User({ provider: LegacyAuthProvider }) user: Account): unknown {
    return user;
  }
}

@Controller('/team')
@Auth()
class TeamController {
  @Get('/me')
  @Auth({ roles: ['member'] })
  public me(@User() user: Account): unknown {
    return user;
  }
}

describe('[auth] @User() after @Auth()', () => {
  afterEach(() => {
    loadAccount.mockClear();
  });

  it('should hand @User() the user validate() loaded instead of loading it again', async () => {
    await using app = await createTestApp({
      controllers: [AccountController],
      providers: [[AuthProvider, AccountAuthProvider], OtherAuthProvider, LegacyAuthProvider],
    });

    const res = await app.get('/accounts/me').header('x-user', '7').expect(200);

    expect(await res.json()).toEqual({ id: '7', provider: 'default' });
    expect(loadAccount).toHaveBeenCalledTimes(1);
  });

  it('should reject the request when validate() returns { error }', async () => {
    await using app = await createTestApp({
      controllers: [AccountController],
      providers: [[AuthProvider, AccountAuthProvider], OtherAuthProvider, LegacyAuthProvider],
    });

    const res = await app.get('/accounts/me').expect(401);

    expect(await res.json()).toMatchObject({ message: 'Unknown user' });
  });

  it('should hand @User() the user when @Auth() is on both the controller and the method', async () => {
    await using app = await createTestApp({
      controllers: [TeamController],
      providers: [[AuthProvider, AccountAuthProvider]],
    });

    const res = await app.get('/team/me').header('x-user', '7').expect(200);

    // one validate() per @Auth(), none for @User()
    expect(await res.json()).toEqual({ id: '7', provider: 'default' });
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });

  it('should not leak the user into the next request', async () => {
    await using app = await createTestApp({
      controllers: [AccountController],
      providers: [[AuthProvider, AccountAuthProvider], OtherAuthProvider, LegacyAuthProvider],
    });

    await app.get('/accounts/me').header('x-user', '7').expect(200);
    const res = await app.get('/accounts/me').header('x-user', '8').expect(200);

    expect(await res.json()).toEqual({ id: '8', provider: 'default' });
  });

  it('should fall back to getCurrentUser() on a route without @Auth()', async () => {
    await using app = await createTestApp({
      controllers: [AccountController],
      providers: [[AuthProvider, AccountAuthProvider], OtherAuthProvider, LegacyAuthProvider],
    });

    const res = await app.get('/accounts/public').header('x-user', '7').expect(200);

    expect(await res.json()).toEqual({ user: { id: '7', provider: 'default' } });
    expect(loadAccount).toHaveBeenCalledTimes(1);
  });

  it('should not hand @User() a user another provider authenticated', async () => {
    await using app = await createTestApp({
      controllers: [AccountController],
      providers: [[AuthProvider, AccountAuthProvider], OtherAuthProvider, LegacyAuthProvider],
    });

    const res = await app.get('/accounts/other').header('x-user', '7').expect(200);

    expect(await res.json()).toEqual({ id: '7', provider: 'other' });
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });

  it('should still load the user once per method without a request context', async () => {
    await using app = await createTestApp({
      controllers: [AccountController],
      providers: [[AuthProvider, AccountAuthProvider], OtherAuthProvider, LegacyAuthProvider],
      config: { requestContext: false },
    });

    const res = await app.get('/accounts/me').header('x-user', '7').expect(200);

    expect(await res.json()).toEqual({ id: '7', provider: 'default' });
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });

  it('should keep accepting the error string or null an older provider returns', async () => {
    await using app = await createTestApp({
      controllers: [AccountController],
      providers: [[AuthProvider, AccountAuthProvider], OtherAuthProvider, LegacyAuthProvider],
    });

    await app.get('/accounts/legacy').expect(401);
    loadAccount.mockClear();

    const res = await app.get('/accounts/legacy').header('x-user', '7').expect(200);

    // no user came back from validate(), so @User() asks getCurrentUser()
    expect(await res.json()).toEqual({ id: '7', provider: 'legacy' });
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });
});
