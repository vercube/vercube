<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useIntrospection } from '../api';
import PageHeader from './PageHeader.vue';
import type { ConfigEntry, ConfigView } from '../api';

const { data, error, loading, reload } = useIntrospection<ConfigView>('config');

const query = ref('');

const sections = computed(() => [
  {
    key: 'runtime',
    title: 'Runtime',
    hint: 'Exposed to the application through RuntimeConfig',
    entries: filter(data.value?.runtime ?? []),
  },
  {
    key: 'app',
    title: 'Application',
    hint: 'The merged vercube.config.ts, as the framework resolved it',
    entries: filter(data.value?.app ?? []),
  },
]);

function filter(entries: ConfigEntry[]): ConfigEntry[] {
  const needle = query.value.trim().toLowerCase();

  if (!needle) {
    return entries;
  }

  return entries.filter((entry) => entry.path.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle));
}

const total = computed(() => (data.value ? data.value.app.length + data.value.runtime.length : 0));
const meta = computed(() => (total.value ? `${total.value} values` : ''));

onMounted(reload);
</script>

<template>
  <PageHeader title="Config" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter keys…" />
    </template>
  </PageHeader>

  <div class="body">
    <p v-if="error" class="error">{{ error }}</p>

    <div v-else-if="data && total === 0" class="empty">
      <span>No configuration to show.</span>
      <span>This application runs entirely on the framework defaults.</span>
    </div>

    <div v-else-if="data" class="ledger">
      <table class="table">
        <thead>
          <tr>
            <th class="col-path">Key</th>
            <th>Value</th>
          </tr>
        </thead>

        <tbody v-for="section in sections" :key="section.key">
          <tr class="band">
            <th scope="colgroup">
              <span class="name">{{ section.title }}</span>
            </th>
            <td class="hint faint">{{ section.hint }}</td>
          </tr>

          <tr v-if="section.entries.length === 0">
            <td colspan="2" class="none">{{ query ? 'Nothing matches the filter.' : 'Empty.' }}</td>
          </tr>

          <tr v-for="entry in section.entries" :key="`${section.key}.${entry.path}`">
            <td class="mono col-path">{{ entry.path }}</td>
            <td class="value" :class="{ redacted: entry.redacted }">{{ entry.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.search {
  width: 190px;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.col-path {
  width: 40%;
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.value.redacted {
  color: var(--text-3);
  font-style: italic;
}

.band th,
.band td {
  position: sticky;
  top: var(--row);
  z-index: 1;
  height: var(--row);
  padding: 0 12px;
  text-align: left;
  background: var(--panel-head);
  box-shadow:
    inset 0 1px 0 var(--edge),
    inset 0 -1px 0 var(--edge);
}

.name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.hint {
  font-size: 11px;
}

.none {
  color: var(--text-3);
  font-size: 12px;
}

p.error {
  margin: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 34%, transparent);
  border-radius: var(--radius-sm);
  background: var(--err-tint);
  color: var(--err);
  font-size: 12.5px;
}

@media (max-width: 720px) {
  .hint {
    display: none;
  }
}
</style>
