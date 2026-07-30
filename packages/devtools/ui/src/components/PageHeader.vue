<script setup lang="ts">
defineProps<{
  title: string;
  meta?: string;
  loading?: boolean;
}>();

defineEmits<{ reload: [] }>();
</script>

<template>
  <header class="topbar">
    <div class="title">
      <h1>{{ title }}</h1>
      <span v-if="meta" class="meta">{{ meta }}</span>
    </div>

    <div class="tools">
      <slot name="tools" />
      <button class="btn ghost" type="button" title="Refresh this panel" @click="$emit('reload')">
        <svg viewBox="0 0 24 24" width="13" height="13" :class="{ spin: loading }" aria-hidden="true">
          <path
            d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Refresh
      </button>
    </div>
  </header>
</template>

<style scoped>

.topbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 53px;
  padding: 0 16px;
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
}

.title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.title h1 {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
}

.meta {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

@media (max-width: 640px) {
  .meta {
    display: none;
  }
}
</style>
