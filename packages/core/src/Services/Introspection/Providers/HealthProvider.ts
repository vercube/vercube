import { Inject } from '@vercube/di';
import { resolveHealthOptions, resolveShutdownDefaults } from '../../../Utils/Health';
import { HealthRegistry } from '../../Health/HealthRegistry';
import { AppLifecycle } from '../../Lifecycle/AppLifecycle';
import type { ConfigTypes } from '../../../Types/ConfigTypes';
import type { HealthTypes } from '../../../Types/HealthTypes';
import type { IntrospectionTypes } from '../../../Types/IntrospectionTypes';

/** A step per lifecycle state, added to the registry revision. */
const STATE_REVISION: Record<HealthTypes.AppState, number> = { starting: 0, ready: 1, draining: 2, closed: 3 };

/**
 * Describes the health of the application: its lifecycle state, the checks
 * modules and the application registered, the last report and the settings in
 * effect.
 *
 * Describing never runs a check. Whoever wants a fresh report calls
 * `app.health.check({ fresh: true })`, and the section changes with it.
 */
export class HealthProvider implements IntrospectionTypes.Provider<HealthTypes.Description> {
  /** @inheritdoc */
  public readonly id = 'health';

  /** @inheritdoc */
  public readonly title = 'Health';

  @Inject(HealthRegistry)
  private readonly gRegistry!: HealthRegistry;

  @Inject(AppLifecycle)
  private readonly gLifecycle!: AppLifecycle;

  /** The application configuration the settings are read from. */
  private fConfig: ConfigTypes.Config = {};

  /**
   * Supplies the configuration to describe.
   *
   * @param config - The merged application config
   */
  public setConfig(config: ConfigTypes.Config): void {
    this.fConfig = config;
  }

  /** @inheritdoc */
  public revision(): number {
    // the registry counts in steps of one, so the state takes the low digits
    return this.gRegistry.revision * 4 + STATE_REVISION[this.gLifecycle.state];
  }

  /** @inheritdoc */
  public describe(): HealthTypes.Description {
    const options = resolveHealthOptions(this.fConfig);
    const shutdown = resolveShutdownDefaults(this.fConfig);

    return {
      state: this.gLifecycle.state,
      checks: this.gRegistry.checks,
      report: this.gRegistry.last,
      config: {
        routes: options !== null,
        endpoints: options?.endpoints ?? { live: null, ready: null, startup: null },
        details: options?.details ?? 'summary',
        token: !!options?.token,
        timeout: this.gRegistry.timeout,
        cacheTtl: this.gRegistry.cacheTtl,
        telemetry: options?.telemetry ?? false,
        drainDelay: shutdown.drainDelay,
        handleSignals: shutdown.handleSignals,
      },
    };
  }
}
