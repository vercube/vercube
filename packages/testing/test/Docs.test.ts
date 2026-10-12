// The snippets of docs/3.modules/14.testing, kept compiling and passing.
import { Auth, User } from '@vercube/auth';
import { Controller, Get, Param, Post } from '@vercube/core';
import { Init, Inject } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { createTestApp, createTestContainer, stub, TestingError } from '../src';
import { testAuth } from '../src/Auth';
import { testTelemetry } from '../src/Telemetry';
import type { TestExtension } from '../src';

interface Account {
  id: string;
  name?: string;
}

class UserRepository {
  public async findById(id: string): Promise<Account> {
    return { id, name: 'real' };
  }

  public async save(user: Account): Promise<Account> {
    return user;
  }
}

class UserService {
  @Inject(UserRepository)
  private gRepository!: UserRepository;

  public find(id: string): Promise<Account> {
    return this.gRepository.findById(id);
  }
}

@Controller('/users')
class UserController {
  @Inject(UserService)
  private gUsers!: UserService;

  @Get('/:id')
  public get(@Param('id') id: string): Promise<Account> {
    return this.gUsers.find(id);
  }
}

@Controller('/admin')
@Auth()
class AdminController {
  @Get('/')
  @Auth({ roles: ['admin'] })
  public home(@User() user: Account): unknown {
    return { id: user.id };
  }
}

class Mailer {
  public async send(_to: string): Promise<void> {}
}

@Controller('/signup')
class SignupController {
  @Inject(Mailer)
  private gMailer!: Mailer;

  @Post('/')
  public async signup(): Promise<{ ok: true }> {
    await this.gMailer.send('ada@example.com');
    return { ok: true };
  }
}

describe('docs', () => {
  it('overview: a first test', async () => {
    await using app = await createTestApp({
      controllers: [UserController],
      providers: [UserService],
      overrides: [[UserRepository, { findById: async (id: string) => ({ id, name: 'Ada' }) }]],
    });

    const res = await app.get('/users/1').expect(200);

    expect(await res.json()).toEqual({ id: '1', name: 'Ada' });
  });

  it('dependencies: overrides and stub()', async () => {
    const sent: string[] = [];

    await using app = await createTestApp({
      controllers: [SignupController],
      providers: [Mailer],
      overrides: [[Mailer, { send: async (to: string) => void sent.push(to) }]],
    });

    await app.post('/signup').expect(200);
    expect(sent).toEqual(['ada@example.com']);

    const repo = stub<UserRepository>({ findById: async () => ({ id: '1' }) }, 'UserRepository');
    expect(() => repo.save({ id: '1' })).toThrow(TestingError);
    expect(() => app.override()).toThrow(TestingError);
  });

  it('dependencies: createTestContainer()', () => {
    class ExchangeRates {
      public rate(): number {
        return 1;
      }
    }

    class PriceService {
      @Inject(ExchangeRates)
      private gRates!: ExchangeRates;

      public ready = false;

      @Init()
      public init(): void {
        this.ready = true;
      }

      public toPln(amount: number): number {
        return amount * this.gRates.rate();
      }
    }

    const { container } = createTestContainer({
      providers: [PriceService],
      overrides: [[ExchangeRates, { rate: () => 4.3 }]],
    });

    expect(container.get(PriceService).toPln(10)).toBe(43);
    expect(container.get(PriceService).ready).toBe(true);
  });

  it('extensions: auth', async () => {
    await using app = await createTestApp({ controllers: [AdminController], extensions: [testAuth()] });

    await app.get('/admin').expect(401);
    await app
      .get('/admin')
      .as({ id: '1', roles: ['admin'] })
      .expect(200);
    await app
      .get('/admin')
      .as({ id: '2', roles: ['user'] })
      .expect(401);
  });

  it('extensions: telemetry', async () => {
    const telemetry = testTelemetry();
    await using app = await createTestApp({
      controllers: [UserController],
      providers: [UserService, UserRepository],
      extensions: [telemetry],
    });

    await app.get('/users/1');
    await telemetry.settle();

    expect(telemetry.span('GET /users/:id')?.attributes['http.response.status_code']).toBe(200);
  });

  it('extensions: writing an extension', async () => {
    function withFakeMailer(): TestExtension & { sent: string[] } {
      const sent: string[] = [];

      return {
        name: 'withFakeMailer',
        sent,
        beforeInitialize: (app) => {
          app.container.bindMock(Mailer, { send: async (to: string) => void sent.push(to) });
        },
      };
    }

    const mailer = withFakeMailer();
    await using app = await createTestApp({ controllers: [SignupController], providers: [Mailer], extensions: [mailer] });

    await app.post('/signup').expect(200);
    expect(mailer.sent).toEqual(['ada@example.com']);
  });
});
