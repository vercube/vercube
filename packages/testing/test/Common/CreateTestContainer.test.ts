import { Init, Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { describe, expect, it } from 'vitest';
import { createTestContainer, TestLogger } from '../../src';

class ExchangeRates {
  public rate(): number {
    return 1;
  }
}

class PriceService {
  @Inject(ExchangeRates)
  private gRates!: ExchangeRates;

  @Inject(Logger)
  private gLogger!: Logger;

  public ready: boolean = false;

  @Init()
  public init(): void {
    this.ready = true;
    this.gLogger.info('prices ready');
  }

  public toPln(amount: number): number {
    return amount * this.gRates.rate();
  }
}

describe('createTestContainer', () => {
  it('should bind providers, apply overrides and run @Init()', () => {
    const { container, logs } = createTestContainer({
      providers: [PriceService, ExchangeRates],
      overrides: [[ExchangeRates, { rate: () => 4.3 }]],
    });

    const prices = container.get(PriceService);

    expect(prices.toPln(10)).toBe(43);
    expect(prices.ready).toBe(true);
    expect(logs?.find('info', 'prices ready')).toBeDefined();
    expect(container.get(Logger)).toBeInstanceOf(TestLogger);
  });

  it('should leave the logger out when asked', () => {
    const { container, logs } = createTestContainer({ logger: false });

    expect(logs).toBeNull();
    expect(container.getOptional(Logger)).toBeNull();
  });

  it('should throw on unstubbed methods when strict', () => {
    const { container } = createTestContainer({
      overrides: [[ExchangeRates, {}]],
      strictOverrides: true,
    });

    expect(() => container.get(ExchangeRates).rate()).toThrow('ExchangeRates.rate is not stubbed');
  });
});
