<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, formatBytes, useResource } from '../api';
import { useInspectorWidth } from '../inspector';
import PageHeader from './PageHeader.vue';
import SplitHandle from './SplitHandle.vue';
import type { StorageValue, StorageView } from '../api';

const { data, error, loading, reload } = useResource<StorageView>('/api/storage');

const query = ref('');
const selectedId = ref<string | null>(null);

const DEFAULT_INSPECTOR_WIDTH = 420;

const inspectorWidth = useInspectorWidth('storage-inspector', DEFAULT_INSPECTOR_WIDTH);

const mounts = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return (data.value?.mounts ?? []).map((mount) => ({
    ...mount,
    matches: mount.keys.filter((key) => !needle || key.toLowerCase().includes(needle)).sort((a, b) => a.localeCompare(b)),
  }));
});

const totalKeys = computed(() => mounts.value.reduce((sum, mount) => sum + mount.matches.length, 0));

const meta = computed(() => {
  const report = data.value;

  if (!report?.available) {
    return '';
  }

  const mountCount = report.mounts.length;
  return `${mountCount} mount${mountCount === 1 ? '' : 's'} · ${totalKeys.value} key${totalKeys.value === 1 ? '' : 's'}`;
});

function keyOf(mount: string, key: string): string {
  return `${mount} ${key}`;
}

const selected = computed(() => {
  if (!selectedId.value) {
    return null;
  }

  const [mount, key] = selectedId.value.split(' ');
  return { mount, key };
});

watch(mounts, (groups) => {
  if (selectedId.value && !groups.some((group) => group.matches.some((key) => keyOf(group.name, key) === selectedId.value))) {
    selectedId.value = null;
  }
});

const value = ref<StorageValue | null>(null);
const valueLoading = ref(false);
const valueError = ref<string | null>(null);

function select(mount: string, key: string): void {
  const id = keyOf(mount, key);
  selectedId.value = selectedId.value === id ? null : id;

  if (selectedId.value) {
    void loadValue(mount, key);
  }
}

async function loadValue(mount: string, key: string): Promise<void> {
  valueLoading.value = true;
  valueError.value = null;
  value.value = null;

  try {
    value.value = await api<StorageValue>(`/api/storage/value?mount=${encodeURIComponent(mount)}&key=${encodeURIComponent(key)}`);
  } catch (error) {
    valueError.value = error instanceof Error ? error.message : String(error);
  } finally {
    valueLoading.value = false;
  }
}

function refreshValue(): void {
  if (selected.value) {
    void loadValue(selected.value.mount, selected.value.key);
  }
}

function formatValue(preview: StorageValue): string {
  if (!preview.text) {
    return '';
  }

  if (preview.truncated) {
    return preview.text;
  }

  try {
    return JSON.stringify(JSON.parse(preview.text), null, 2);
  } catch {
    return preview.text;
  }
}

onMounted(reload);
</script>

<template>
  <PageHeader title="Storage" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <input v-model="query" class="field search" type="search" placeholder="Filter keys…" />
    </template>
  </PageHeader>

  <div class="body" :class="{ open: selected }" :style="{ '--inspector': `${inspectorWidth}px` }">
    <p v-if="error" class="error">{{ error }}</p>

    
    <div v-else-if="data && !data.available && !data.cache.available" class="empty">
      <span>This application does not use storage.</span>
      <span>Mount @vercube/storage or add @vercube/cache and their contents appear here.</span>
    </div>

    <div v-else-if="data" class="scroll layout">
      <section v-if="data.cache.available" class="cache">
        <span class="label">Cache</span>
        <span v-if="data.cache.mount" class="faint"
          >writes through <b class="mono">{{ data.cache.mount }}</b></span
        >
        <span v-for="entry in data.cache.defaults" :key="entry.path" class="entry">
          <span class="faint">{{ entry.path }}</span>
          <span class="mono">{{ entry.value }}</span>
        </span>
      </section>

      <div v-if="data.available && totalKeys === 0" class="empty">
        <span v-if="query">No key matches the filter.</span>
        <span v-else-if="mounts.length === 0">Nothing is mounted yet.</span>
        <span v-else>Every mount is empty.</span>
        <span v-if="query">Clear the filter to see all of them.</span>
      </div>

      <div v-else-if="data.available" class="ledger">
        <table class="table">
          <thead>
            <tr>
              <th>Key</th>
              <th class="col-toggle" aria-label="Details" />
            </tr>
          </thead>

          <tbody v-for="mount in mounts" :key="mount.name">
            <tr class="band">
              <th scope="colgroup">
                <span class="mono name">{{ mount.name }}</span>
              </th>
              <td class="count faint">
                <span class="mono">{{ mount.driver }}</span>
                · {{ mount.matches.length }} key{{ mount.matches.length === 1 ? '' : 's' }}
              </td>
            </tr>

            <tr v-if="mount.error">
              <td colspan="2" class="row-note">{{ mount.error }}</td>
            </tr>

            <tr v-else-if="mount.matches.length === 0">
              <td colspan="2" class="row-note">{{ query ? 'No key matches the filter.' : 'This mount is empty.' }}</td>
            </tr>

            <tr
              v-for="key in mount.matches"
              :key="keyOf(mount.name, key)"
              class="row"
              :class="{ open: selectedId === keyOf(mount.name, key) }"
              tabindex="0"
              role="button"
              :aria-pressed="selectedId === keyOf(mount.name, key)"
              @click="select(mount.name, key)"
              @keydown.enter.prevent="select(mount.name, key)"
              @keydown.space.prevent="select(mount.name, key)"
            >
              <td class="mono key">{{ key }}</td>
              <td class="col-toggle">
                <svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </td>
            </tr>

            <tr v-if="mount.truncated && !query">
              <td colspan="2" class="row-note">Showing the first {{ mount.keys.length }} of {{ mount.size }} keys.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SplitHandle
      v-if="selected"
      v-model="inspectorWidth"
      :initial="DEFAULT_INSPECTOR_WIDTH"
      :min="320"
      :max="1000"
      label="Resize the value inspector"
    />

    <aside v-if="selected" class="inspector scroll">
      <header class="head">
        <div class="title">
          <span class="tag">{{ selected.mount }}</span>
          <span class="mono key">{{ selected.key }}</span>
          <button class="btn ghost" type="button" title="Re-read this value" @click="refreshValue">
            <svg viewBox="0 0 24 24" width="13" height="13" :class="{ spin: valueLoading }" aria-hidden="true">
              <path
                d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button class="close" type="button" title="Close the value inspector" @click="selectedId = null">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <p v-if="valueError" class="error">{{ valueError }}</p>

      <template v-else-if="value">
        <p v-if="value.error" class="none">{{ value.error }}</p>

        <template v-else>
          <p class="meta">
            <span class="mono">{{ value.type }}</span>
            <span class="faint">· {{ formatBytes(value.size) }}</span>
          </p>

          <pre class="code">{{ formatValue(value) }}</pre>

          <p v-if="value.truncated" class="none">
            Showing the first {{ formatBytes(value.text?.length ?? 0) }} of {{ formatBytes(value.size) }}.
          </p>
        </template>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.search {
  width: 190px;
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.body.open {
  grid-template-columns: minmax(0, 1fr) var(--inspector);
}

.layout {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.cache {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 20px;
  min-height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
  font-size: 12px;
}

.entry {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.ledger {
  flex: 1;
}

.col-toggle {
  width: 30px;
}

.row {
  cursor: pointer;
}

.key {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  display: block;
  width: 13px;
  height: 13px;
  color: var(--text-3);
  transition: color 0.12s ease;
}

.row.open .chevron {
  color: var(--brand);
}

.row.open td,
.row.open:hover td {
  background: var(--brand-tint);
}

.row.open td:first-child {
  box-shadow: inset 2px 0 0 var(--brand);
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

.count {
  font-size: 11px;
  white-space: nowrap;
}

.inspector {
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 14px 16px 32px;
  border-left: 1px solid var(--edge);
  background: var(--chassis);
}

.head {
  display: grid;
}

.title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.key {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.meta {
  margin: 0;
  display: flex;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-2);
}

.none {
  margin: 0;
  padding: 12px 14px;
  color: var(--text-3);
  font-size: 12px;
}

.row-note {
  height: auto;
  padding: 10px 12px;
  color: var(--text-3);
  font-size: 12px;
}

.error {
  margin: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 34%, transparent);
  border-radius: var(--radius-sm);
  background: var(--err-tint);
  color: var(--err);
  font-size: 12.5px;
}

@media (max-width: 720px) {
  .cache {
    display: none;
  }
}
</style>
