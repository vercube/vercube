import type { TelemetryTypes } from '../../Types/TelemetryTypes';

/**
 * Holds the telemetry implementation installed by an instrumentation package.
 *
 * The registry is always bound, so core services can look it up
 * unconditionally, but {@link TelemetryRegistry.hooks} stays `null` until
 * something calls {@link TelemetryRegistry.install}. Consumers on the request
 * hot path resolve it once and cache the result, which is why installation has
 * to happen during application setup - a plugin's `use()` phase - and not after
 * the first request has been served.
 */
export class TelemetryRegistry {
  /** The installed hooks, or `null` while no telemetry package is active. */
  private fHooks: TelemetryTypes.Hooks | null = null;

  /** Resolved telemetry options, kept here so other packages can read them. */
  private fOptions: TelemetryTypes.Options | null = null;

  /**
   * The installed hooks, or `null` when telemetry is inactive.
   */
  public get hooks(): TelemetryTypes.Hooks | null {
    return this.fHooks;
  }

  /**
   * Whether an implementation has been installed.
   */
  public get enabled(): boolean {
    return this.fHooks !== null;
  }

  /**
   * The options the active implementation was configured with.
   */
  public get options(): TelemetryTypes.Options | null {
    return this.fOptions;
  }

  /**
   * Installs a telemetry implementation.
   *
   * @param hooks - The implementation core will call into
   * @param options - The resolved options it was configured with
   * @throws Error when an implementation is already installed
   */
  public install(hooks: TelemetryTypes.Hooks, options: TelemetryTypes.Options = {}): void {
    if (this.fHooks !== null) {
      throw new Error('Telemetry is already installed. Only one telemetry implementation can be active at a time.');
    }

    this.fHooks = hooks;
    this.fOptions = options;
  }

  /**
   * Removes the current implementation.
   *
   * Services that cached the hooks keep their cached reference, so this is only
   * useful between tests.
   */
  public uninstall(): void {
    this.fHooks = null;
    this.fOptions = null;
  }
}
