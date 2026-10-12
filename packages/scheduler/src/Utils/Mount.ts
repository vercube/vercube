import type { SchedulerStore } from '../Services/SchedulerStore';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/**
 * Type checks a store mount and erases its options, so it fits the plugin options.
 *
 * `SchedulerManager.mount()` infers the store from its argument and checks
 * `initOptions` against it. The plugin options cannot, since there is no
 * inference site there - this helper is that site.
 *
 * @param {SchedulerTypes.Mount<T>} mount - Store class and its init options
 * @returns {SchedulerTypes.AnyMount} The very same mount, with its options type erased
 *
 * @example
 * ```ts
 * app.addPlugin(SchedulerPlugin, {
 *   store: defineSchedulerStore({ store: RedisStore, initOptions: { url: process.env.REDIS_URL } }),
 * });
 * ```
 */
export function defineSchedulerStore<T extends SchedulerStore<unknown>>(mount: SchedulerTypes.Mount<T>): SchedulerTypes.AnyMount {
  return mount as SchedulerTypes.AnyMount;
}
