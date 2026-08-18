import { ref, watch } from 'vue';
import type { Ref } from 'vue';

export function useInspectorWidth(key: string, initial: number): Ref<number> {
  const stored = Number.parseInt(globalThis.localStorage?.getItem(`vercube-devtools-${key}`) ?? '', 10);
  const width = ref(Number.isFinite(stored) ? stored : initial);

  watch(width, (value) => globalThis.localStorage?.setItem(`vercube-devtools-${key}`, String(value)));

  return width;
}
