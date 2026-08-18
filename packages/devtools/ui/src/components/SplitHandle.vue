<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    maxRatio?: number;
    initial?: number;
    side?: 'start' | 'end';
    label?: string;
  }>(),
  { min: 300, max: 900, maxRatio: 0.72, initial: 420, side: 'end', label: 'Resize panel' },
);

const emit = defineEmits<{ 'update:modelValue': [width: number] }>();

const handle = ref<HTMLElement | null>(null);
const dragging = ref(false);

function clamp(width: number): number {
  const container = handle.value?.parentElement?.getBoundingClientRect().width ?? Infinity;
  return Math.round(Math.max(props.min, Math.min(width, props.max, container * props.maxRatio)));
}

function onPointerDown(event: PointerEvent): void {
  dragging.value = true;
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) {
    return;
  }

  const bounds = handle.value?.parentElement?.getBoundingClientRect();

  if (!bounds) {
    return;
  }

  const width = props.side === 'end' ? bounds.right - event.clientX : event.clientX - bounds.left;
  emit('update:modelValue', clamp(width));
}

function onPointerUp(event: PointerEvent): void {
  dragging.value = false;
  (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
}

function nudge(step: number): void {
  emit('update:modelValue', clamp(props.modelValue + step));
}

watch(dragging, (active) => {
  document.body.classList.toggle('is-resizing', active);
});

onBeforeUnmount(() => document.body.classList.remove('is-resizing'));
</script>

<template>
  <div
    ref="handle"
    class="handle"
    :class="[side, { active: dragging }]"
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :style="{ [side === 'end' ? 'right' : 'left']: `${modelValue}px` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dblclick="$emit('update:modelValue', clamp(initial))"
    @keydown.left.prevent="nudge(side === 'end' ? 24 : -24)"
    @keydown.right.prevent="nudge(side === 'end' ? -24 : 24)"
    @keydown.home.prevent="$emit('update:modelValue', clamp(initial))"
  >
    <span class="grip" />
  </div>
</template>

<style scoped>
.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  width: 9px;
  margin-inline: -4px;
  cursor: col-resize;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.handle::before {
  content: '';
  position: absolute;
  inset-block: 0;
  width: 1px;
  background: var(--brand);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.handle:hover::before,
.handle:focus-visible::before,
.handle.active::before {
  opacity: 1;
}

.grip {
  position: relative;
  width: 2px;
  height: 22px;
  border-radius: var(--radius-sm);
  background: var(--edge-strong);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.handle:hover .grip,
.handle.active .grip {
  opacity: 1;
  background: var(--brand);
}

.handle:focus-visible {
  outline: none;
}

.handle:focus-visible .grip {
  opacity: 1;
  background: var(--brand);
  height: 40px;
}
</style>
