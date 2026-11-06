import type { HealthTypes } from '../../Types/HealthTypes';

/**
 * A callback told about every state change.
 */
export type AppStateListener = (state: HealthTypes.AppState, previous: HealthTypes.AppState) => void;

/** The order states move in. A state never goes back to an earlier one. */
const ORDER: Record<HealthTypes.AppState, number> = { starting: 0, ready: 1, draining: 2, closed: 3 };

/**
 * Tracks where the application is in its lifecycle, `app.state`.
 *
 * A service rather than a field on `App`, so anything in the container (a
 * readiness route, a custom middleware) can inject it and read the state
 * without holding the application.
 *
 * States only move forward: `starting` → `ready` → `draining` → `closed`.
 * A close that begins before the start finished goes straight to `draining`.
 */
export class AppLifecycle {
  /** The current state. */
  private fState: HealthTypes.AppState = 'starting';

  /** Callbacks told about state changes. */
  private readonly fListeners: Set<AppStateListener> = new Set();

  /**
   * The current state.
   */
  public get state(): HealthTypes.AppState {
    return this.fState;
  }

  /**
   * Whether the application should receive traffic: started and not closing.
   */
  public get ready(): boolean {
    return this.fState === 'ready';
  }

  /**
   * Moves to a later state. Moving to the current or an earlier state does
   * nothing.
   *
   * @param {HealthTypes.AppState} state - The new state
   * @returns {boolean} Whether the state changed
   */
  public advance(state: HealthTypes.AppState): boolean {
    if (ORDER[state] <= ORDER[this.fState]) {
      return false;
    }

    const previous = this.fState;

    this.fState = state;

    for (const listener of this.fListeners) {
      try {
        listener(state, previous);
      } catch {
        // a listener must not stop the application from closing
      }
    }

    return true;
  }

  /**
   * Registers a callback told about every state change.
   *
   * @param {AppStateListener} listener - The callback
   * @returns {() => void} Removes the callback again
   */
  public onChange(listener: AppStateListener): () => void {
    this.fListeners.add(listener);

    return () => {
      this.fListeners.delete(listener);
    };
  }
}
