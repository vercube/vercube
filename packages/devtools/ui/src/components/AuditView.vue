<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useResource } from '../api';
import PageHeader from './PageHeader.vue';
import type { AuditReport } from '../api';

const { data, error, loading, reload } = useResource<AuditReport>('/api/audit');

const severities = ['error', 'warning', 'info'] as const;
type Severity = (typeof severities)[number];

const hidden = ref<Set<Severity>>(new Set());

const issues = computed(() => (data.value?.issues ?? []).filter((issue) => !hidden.value.has(issue.severity)));

const scoreTone = computed(() => {
  const score = data.value?.score ?? 100;

  if (score >= 90) {
    return 'good';
  }

  return score >= 70 ? 'warn' : 'bad';
});

function toggle(severity: Severity): void {
  const next = new Set(hidden.value);

  if (next.has(severity)) {
    next.delete(severity);
  } else {
    next.add(severity);
  }

  hidden.value = next;
}

const meta = computed(() => {
  const report = data.value;

  if (!report) {
    return '';
  }

  return report.issues.length === 0 ? 'No findings' : `${report.issues.length} finding${report.issues.length === 1 ? '' : 's'}`;
});

onMounted(reload);
</script>

<template>
  <PageHeader title="Audit" :meta="meta" :loading="loading" @reload="reload">
    <template #tools>
      <button
        v-for="severity in severities"
        :key="severity"
        class="filter"
        :class="{ off: hidden.has(severity) }"
        type="button"
        :aria-pressed="!hidden.has(severity)"
        @click="toggle(severity)"
      >
        <span class="dot" :class="severity" />
        {{ severity }}
      </button>
    </template>
  </PageHeader>

  <div class="body">
    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="data" class="verdict">
      <div class="score" :class="scoreTone">
        <strong class="num">{{ data.score }}</strong>
        <span class="scale">/ 100</span>
      </div>

      <div class="text">
        <h2>
          {{
            data.issues.length === 0 ? 'Nothing to report' : `${data.issues.length} finding${data.issues.length === 1 ? '' : 's'}`
          }}
        </h2>
        <p v-if="data.issues.length === 0">
          The container resolves cleanly, every route is reachable and no recorded request failed.
        </p>
        <p v-else>Ranked by how likely each one is to break something.</p>
      </div>

      <dl class="counts">
        <div v-for="severity in severities" :key="severity" class="count" :class="severity">
          <dt>{{ severity }}</dt>
          <dd class="num">{{ data.counts[severity] }}</dd>
        </div>
      </dl>
    </section>

    <div class="scroll findings">
      <article v-for="(issue, index) in issues" :key="`${issue.rule}-${index}`" class="issue" :class="issue.severity">
        <header class="head">
          <span class="severity">{{ issue.severity }}</span>
          <h3>{{ issue.title }}</h3>
          <code class="rule">{{ issue.rule }}</code>
        </header>

        <p>{{ issue.detail }}</p>

        <ul v-if="issue.targets.length" class="targets">
          <li v-for="target in issue.targets.slice(0, 12)" :key="target" class="mono">{{ target }}</li>
          <li v-if="issue.targets.length > 12" class="more">+{{ issue.targets.length - 12 }} more</li>
        </ul>
      </article>

      <div v-if="data && issues.length === 0 && data.issues.length > 0" class="empty">
        <span>Every finding is filtered out.</span>
        <span>Turn a severity back on above to see them.</span>
      </div>

      <div v-else-if="data && data.issues.length === 0" class="empty">
        <span>No findings.</span>
        <span>Nothing in the container, the router or the recorded traffic looks wrong.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  text-transform: capitalize;
}

.filter.off {
  color: var(--text-3);
  opacity: 0.55;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}

.filter.off .dot {
  background: var(--text-3) !important;
}

.dot.error {
  background: var(--err);
}

.dot.warning {
  background: var(--warn);
}

.dot.info {
  background: var(--info);
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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

.verdict {
  flex: none;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--edge);
  background: var(--chassis);
}

.score {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex: none;
  color: var(--ok);
}

.score.warn {
  color: var(--warn);
}

.score.bad {
  color: var(--err);
}

.score strong {
  font-size: 38px;
  line-height: 1;
}

.scale {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-3);
}

.text {
  flex: 1;
  min-width: 0;
}

.text h2 {
  font-size: 14px;
}

.text p {
  margin: 3px 0 0;
  color: var(--text-2);
  font-size: 12.5px;
  max-width: 70ch;
}

.counts {
  display: flex;
  margin: 0;
  flex: none;
}

.counts > div {
  display: grid;
  gap: 1px;
  justify-items: end;
  min-width: 74px;
  padding: 0 14px;
}

.counts > div + div {
  border-left: 1px solid var(--edge);
}

.counts dt {
  font-size: 11px;
  color: var(--text-3);
}

.counts dd {
  margin: 0;
  font-size: 17px;
  color: var(--text-2);
}

.count.error dd {
  color: var(--err);
}

.count.warning dd {
  color: var(--warn);
}

.count.info dd {
  color: var(--info);
}

.findings {
  flex: 1;
}

.issue {
  display: grid;
  gap: 8px;
  padding: 14px 16px 16px 14px;
  border-bottom: 1px solid var(--edge);
  border-left: 2px solid var(--edge-strong);
}

.issue.error {
  border-left-color: var(--err);
}

.issue.warning {
  border-left-color: var(--warn);
}

.issue.info {
  border-left-color: var(--info);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.severity {
  font-size: 11px;
  min-width: 52px;
  color: var(--text-3);
}

.issue.error .severity {
  color: var(--err);
}

.issue.warning .severity {
  color: var(--warn);
}

.issue.info .severity {
  color: var(--info);
}

.head h3 {
  font-size: 13px;
  color: var(--text);
}

.rule {
  margin-left: auto;
  color: var(--text-3);
  font-size: 10.5px;
}

.issue p {
  margin: 0 0 0 62px;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.55;
  max-width: 92ch;
}

.targets {
  list-style: none;
  margin: 2px 0 0 62px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.targets li {
  font-size: 11.5px;
  color: var(--text-3);
}

.more {
  font-family: var(--sans);
}

@media (max-width: 860px) {
  .verdict {
    flex-wrap: wrap;
    gap: 14px;
  }

  .counts > div:first-child {
    padding-left: 0;
  }

  .issue p,
  .targets {
    margin-left: 0;
  }
}
</style>
