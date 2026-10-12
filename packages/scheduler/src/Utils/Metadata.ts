import type { SchedulerTypes } from '../Types/SchedulerTypes';

/**
 * Definitions whose name was derived from the class and method rather than
 * given explicitly.
 *
 * A weak set keeps the mark off the definition itself, so nothing leaks into
 * what the manager stores or reports.
 */
const generated: WeakSet<SchedulerTypes.JobDefinition> = new WeakSet();

/**
 * Marks a definition whose name was derived from `${ClassName}.${methodName}`.
 *
 * @param definition - The definition the decorator built
 * @returns The same definition
 */
export function markGeneratedName(definition: SchedulerTypes.JobDefinition): SchedulerTypes.JobDefinition {
  generated.add(definition);

  return definition;
}

/**
 * Whether a definition's name was derived from its class and method.
 *
 * Such a name is fine for an instance job, but not for a cluster job: bundlers
 * rename classes whose names collide (`Jobs` becomes `Jobs$1`), and the name is
 * part of every lock key, so two builds would not agree on it.
 *
 * @param definition - The definition to check
 * @returns True when the name was not given explicitly
 */
export function hasGeneratedName(definition: SchedulerTypes.JobDefinition): boolean {
  return generated.has(definition);
}
