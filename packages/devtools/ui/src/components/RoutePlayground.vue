<script lang="ts">
import { reactive } from 'vue';
import { loadAuth } from '../playground/auth';
import { PlaygroundHistory } from '../playground/history';
import type { StorageLike } from '../playground/auth';
import type { Draft } from '../playground/request';

/**
 * Browser storage, when the page is allowed to use it.
 *
 * @returns `localStorage`, or null in a context that blocks it
 */
function storage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Shared by every route and kept for the life of the page, so a draft survives
// looking at another route and credentials are entered once per session.
const drafts = new Map<string, Draft>();
const auth = reactive(loadAuth(storage()));
const history = new PlaygroundHistory(storage());
</script>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, toRaw, watch } from 'vue';
import { formatBytes, formatMs, loadRequests, statusClass } from '../api';
import { hasCredentials, persistAuth, toCredentials } from '../playground/auth';
import { toCurl, toFetch } from '../playground/export';
import { createMarker } from '../playground/marker';
import { buildRequest, createDraft, describeForm, needsConfirmation, validateDraft } from '../playground/request';
import { exampleOf, hintOf } from '../playground/schema';
import { createSseParser } from '../playground/sse';
import type { RequestRecord, RouteInfo } from '../api';
import type { AuthKind } from '../playground/auth';
import type { HistoryEntry } from '../playground/history';
import type { BodyMode, BuiltRequest, Field } from '../playground/request';
import type { SchemaIssue } from '../playground/schema';
import type { SseEvent } from '../playground/sse';
import type { Pair } from '../playground/url';

const props = defineProps<{
  route: RouteInfo;
  /** Requests the stream has delivered, used to find the one the playground sent. */
  live: RequestRecord[];
}>();

const emit = defineEmits<{ 'open-request': [id: string] }>();

/** Largest response text shown. The rest is counted, not rendered. */
const MAX_TEXT = 256 * 1024;

/** Stream events kept on screen. */
const MAX_EVENTS = 200;

/** How often, and how many times, the request buffer is asked for the request just sent. */
const RECORD_POLL_MS = 250;
const RECORD_POLLS = 6;

const AUTH_KINDS: { id: AuthKind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'bearer', label: 'Bearer token' },
  { id: 'basic', label: 'Basic' },
  { id: 'apikey', label: 'API key header' },
  { id: 'cookie', label: 'Cookie' },
];

const BODY_MODES: { id: BodyMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'form', label: 'Form data' },
];

/** What came back, or what is still coming. */
interface Result {
  marker: string;
  method: string;
  target: string;
  phase: 'sending' | 'streaming' | 'done' | 'stopped' | 'failed';
  status?: number;
  statusText?: string;
  headers: [string, string][];
  /** Milliseconds until the response headers arrived. */
  headersMs?: number;
  /** Milliseconds until the body ended. */
  totalMs?: number;
  /** Body bytes read so far. */
  size: number;
  kind: 'empty' | 'text' | 'events' | 'binary';
  text: string;
  truncated: boolean;
  events: (SseEvent & { at: number })[];
  /** Events that scrolled out of the kept window. */
  dropped: number;
  download?: { url: string; name: string };
  error?: string;
  redirectedTo?: string;
  /** Whether devtools recorded the request: unknown yet, found, or given up on. */
  recorded: 'waiting' | 'yes' | 'no';
  recordId?: string;
}

const origin = globalThis.location.origin;
const routeKey = props.route.id;
const model = describeForm(props.route);

const draft = reactive(drafts.get(routeKey) ?? createDraft(model));

drafts.set(routeKey, draft);

/** Whether the credentials are sent with this request. On for routes that ask for them. */
const useAuth = ref(props.route.secured === true);

/** Set by the first attempt to send, after which empty required fields are pointed out. */
const touched = ref(false);

/** Set while a request waits for its second click. */
const armed = ref(false);
const confirmButton = ref<HTMLButtonElement | null>(null);

const result = ref<Result | null>(null);
const showHeaders = ref(false);
const includeCredentials = ref(false);
const copied = ref<'curl' | 'fetch' | null>(null);

const saving = ref(false);
const saveName = ref('');

/** Bumped on every history change: the store itself is not reactive. */
const historyRevision = ref(0);

let controller: AbortController | null = null;
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const busy = computed(() => result.value?.phase === 'sending' || result.value?.phase === 'streaming');

const credentials = computed(() => (useAuth.value ? toCredentials(auth) : undefined));

/** The request as it would be sent now, without a marker: the preview and the exports. */
const preview = computed(() => buildRequest(props.route, draft, { credentials: credentials.value }));

const issues = computed(() => validateDraft(draft, model));

/**
 * The problems worth showing in a section.
 *
 * "Is required" on a form nobody has tried to send yet is noise, so those wait
 * for the first attempt.
 */
function visible(list: SchemaIssue[]): SchemaIssue[] {
  return touched.value ? list : list.filter((issue) => issue.message !== 'is required');
}

const problemCount = computed(() => issues.value.params.length + issues.value.query.length + issues.value.body.length);

const recent = computed(() => (historyRevision.value, history.recent(routeKey)));
const saved = computed(() => (historyRevision.value, history.saved(routeKey)));

/** Whether a row of a list is one the handler declares, so its name is fixed. */
function declared(fields: Field[], pair: Pair, index: number): Field | undefined {
  return fields[index]?.name === pair.name ? fields[index] : undefined;
}

function addRow(list: Pair[]): void {
  list.push({ name: '', value: '' });
}

function resetBody(): void {
  if (model.bodySchema !== undefined) {
    draft.bodyMode = 'json';
    draft.body = JSON.stringify(exampleOf(model.bodySchema), null, 2);
  }
}

function formatIssue(issue: SchemaIssue): string {
  return issue.path ? `${issue.path} ${issue.message}` : `Body ${issue.message}`;
}

// Anything typed after the first click changes what would be sent, so the
// confirmation is asked for again.
watch(
  [draft, useAuth, () => ({ ...auth })],
  () => {
    armed.value = false;
  },
  { deep: true },
);

watch(
  auth,
  () => {
    persistAuth(storage(), auth);
  },
  { deep: true },
);

/** First click on Send. Reads start right away; writes and doubtful requests ask once more. */
function requestSend(): void {
  touched.value = true;

  if (preview.value.missing.length > 0 || busy.value) {
    return;
  }

  if (needsConfirmation(draft.method) || problemCount.value > 0) {
    armed.value = true;
    // Focus moves to the confirmation, so Enter sends and Escape is one key away.
    void nextTick(() => confirmButton.value?.focus());

    return;
  }

  void send();
}

/**
 * Sets cookies for the duration of one request.
 *
 * `fetch` refuses to send a `Cookie` header, so the only way to send one from
 * a page is to put it in the jar. It is taken out again as soon as the request
 * is on its way, and a cookie that was already there is put back.
 *
 * @param cookies - Cookies of the built request
 * @returns A function that undoes the change
 */
function setCookies(cookies: BuiltRequest['cookies']): () => void {
  if (cookies.length === 0) {
    return () => {};
  }

  const before = new Map(
    document.cookie
      .split(';')
      .map((pair) => pair.trim().split('='))
      .filter(([name]) => name)
      .map(([name, ...rest]) => [name, rest.join('=')]),
  );

  for (const cookie of cookies) {
    /* oxlint-disable-next-line unicorn/no-document-cookie */
    document.cookie = `${cookie.name}=${encodeURIComponent(cookie.value)}; path=/; SameSite=Strict`;
  }

  return () => {
    for (const cookie of cookies) {
      const previous = before.get(cookie.name);

      /* oxlint-disable-next-line unicorn/no-document-cookie */
      document.cookie =
        previous === undefined
          ? `${cookie.name}=; path=/; max-age=0; SameSite=Strict`
          : `${cookie.name}=${previous}; path=/; SameSite=Strict`;
    }
  };
}

/** Whether a content type is shown as text. */
function isText(type: string): boolean {
  return /^text\/|json|xml|javascript|x-www-form-urlencoded|graphql/.test(type);
}

function pretty(text: string, type: string): string {
  if (!type.includes('json')) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Sends the request. Only ever called from a click on Send or on its confirmation. */
async function send(): Promise<void> {
  armed.value = false;
  controller?.abort();

  if (result.value?.download) {
    URL.revokeObjectURL(result.value.download.url);
  }

  const marker = createMarker();
  const { request } = buildRequest(props.route, draft, { marker, credentials: credentials.value });
  const abort = new AbortController();

  controller = abort;
  showHeaders.value = false;
  result.value = {
    marker: marker.id,
    method: request.method,
    target: request.target,
    phase: 'sending',
    headers: [],
    size: 0,
    kind: 'empty',
    text: '',
    truncated: false,
    events: [],
    dropped: 0,
    recorded: 'waiting',
  };

  // The ref hands back a reactive proxy; writing through it is what updates the panel.
  const current = result.value;
  const sent = { at: Date.now(), draft: structuredClone(toRaw(draft)) };
  const started = performance.now();
  const clearCookies = setCookies(request.cookies);

  let body: BodyInit | undefined;

  if (request.body.kind === 'text') {
    body = request.body.text;
  } else if (request.body.kind === 'form') {
    const form = new FormData();

    for (const field of request.body.fields) {
      form.append(field.name, field.value);
    }

    body = form;
  }

  try {
    const response = await fetch(request.target, {
      method: request.method,
      headers: request.headers.map((header) => [header.name, header.value] as [string, string]),
      body,
      signal: abort.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });

    clearCookies();

    const type = (response.headers.get('content-type') ?? '').toLowerCase();

    current.status = response.status;
    current.statusText = response.statusText;
    current.headers = [...response.headers.entries()];
    current.headersMs = performance.now() - started;
    current.redirectedTo = response.redirected ? response.url : undefined;

    if (type.startsWith('text/event-stream')) {
      current.kind = 'events';
      current.phase = 'streaming';
      await readEvents(response, current);
    } else if (!response.body || request.method === 'HEAD') {
      current.kind = 'empty';
    } else if (isText(type) || type === '') {
      await readText(response, current, type);
    } else {
      const blob = await response.blob();

      current.kind = 'binary';
      current.size = blob.size;
      current.download = {
        url: URL.createObjectURL(blob),
        name: request.target.split('?')[0].split('/').findLast(Boolean) || 'response',
      };
    }

    current.phase = 'done';
  } catch (error) {
    clearCookies();

    if (abort.signal.aborted) {
      current.phase = 'stopped';
    } else {
      current.phase = 'failed';
      current.error = error instanceof Error ? error.message : String(error);
    }
  } finally {
    current.totalMs = performance.now() - started;

    if (controller === abort) {
      controller = null;
    }
  }

  history.record({
    at: sent.at,
    route: routeKey,
    method: request.method,
    target: request.target,
    draft: sent.draft,
    status: current.status,
    durationMs: current.totalMs,
  });
  historyRevision.value++;

  void findRecord(current);
}

/** Reads a text body, keeping at most {@link MAX_TEXT} of it. */
async function readText(response: Response, current: Result, type: string): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    current.size += value.byteLength;

    if (text.length < MAX_TEXT) {
      text += decoder.decode(value, { stream: true });
    }
  }

  current.truncated = text.length > MAX_TEXT;
  current.text = current.truncated ? text.slice(0, MAX_TEXT) : pretty(text, type);
  current.kind = current.size === 0 ? 'empty' : 'text';
}

/** Reads an event stream until it ends or is stopped. */
async function readEvents(response: Response, current: Result): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser();

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    current.size += value.byteLength;

    for (const event of parse(decoder.decode(value, { stream: true }))) {
      current.events.push({ ...event, at: Date.now() });
    }

    if (current.events.length > MAX_EVENTS) {
      current.dropped += current.events.length - MAX_EVENTS;
      current.events.splice(0, current.events.length - MAX_EVENTS);
    }
  }
}

function stop(): void {
  controller?.abort();
}

/** Whether a recorded request is the one a result belongs to. */
function matches(record: RequestRecord, marker: string): boolean {
  return record.id === marker || record.playground === marker;
}

/**
 * Looks for the request in what devtools recorded.
 *
 * The live stream usually delivers it within a flush interval. The buffer is
 * asked as well, for a paused stream and for a tab that was not listening.
 */
async function findRecord(current: Result): Promise<void> {
  for (let attempt = 0; attempt < RECORD_POLLS && current.recorded === 'waiting'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RECORD_POLL_MS));

    if (result.value?.marker !== current.marker || current.recorded !== 'waiting') {
      return;
    }

    try {
      const record = (await loadRequests()).find((entry) => matches(entry, current.marker));

      if (record) {
        current.recorded = 'yes';
        current.recordId = record.id;
      }
    } catch {
      // The next attempt, or the live stream, may still find it.
    }
  }

  if (current.recorded === 'waiting') {
    current.recorded = 'no';
  }
}

watch(
  () => props.live,
  (records) => {
    const current = result.value;
    const record = current && current.recorded !== 'yes' ? records.find((entry) => matches(entry, current.marker)) : undefined;

    if (current && record) {
      current.recorded = 'yes';
      current.recordId = record.id;
    }
  },
);

function restore(entry: HistoryEntry): void {
  Object.assign(draft, structuredClone(entry.draft));
}

function removeEntry(entry: HistoryEntry): void {
  history.remove(entry.id);
  historyRevision.value++;
}

function clearHistory(): void {
  history.clear(routeKey);
  historyRevision.value++;
}

function save(): void {
  history.save(routeKey, saveName.value, draft, preview.value.request.target);
  historyRevision.value++;
  saving.value = false;
  saveName.value = '';
}

async function copy(kind: 'curl' | 'fetch'): Promise<void> {
  const options = { origin, includeCredentials: includeCredentials.value };
  const text = kind === 'curl' ? toCurl(preview.value.request, options) : toFetch(preview.value.request, options);

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // An insecure context has no clipboard API; the old command still works there.
    const area = document.createElement('textarea');

    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }

  copied.value = kind;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = null), 1400);
}

function formatClock(epoch: number): string {
  return new Date(epoch).toLocaleTimeString(undefined, { hour12: false });
}

const phaseLabel = computed(() => {
  switch (result.value?.phase) {
    case 'sending': {
      return 'Waiting for the response';
    }
    case 'streaming': {
      return 'Streaming';
    }
    case 'stopped': {
      return 'Stopped';
    }
    case 'failed': {
      return 'No response';
    }
    default: {
      return '';
    }
  }
});

onUnmounted(() => {
  controller?.abort();
  clearTimeout(copiedTimer);

  if (result.value?.download) {
    URL.revokeObjectURL(result.value.download.url);
  }
});
</script>

<template>
  <div class="playground">
    <section class="part">
      <div class="target">
        <select v-if="model.methods.length > 1" v-model="draft.method" class="field verb" aria-label="Method">
          <option v-for="method in model.methods" :key="method" :value="method">{{ method }}</option>
        </select>
        <span v-else class="mono verb">{{ draft.method }}</span>
        <code class="url">{{ origin }}{{ preview.request.target }}</code>
      </div>
    </section>

    <section v-if="model.params.length" class="part">
      <h3 class="label">Path</h3>
      <div class="rows">
        <label v-for="param in model.params" :key="param.name" class="row fixed">
          <span class="mono key">{{ param.name }}</span>
          <input
            v-model="draft.params[param.name]"
            class="field"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :placeholder="hintOf(param.schema) || 'value'"
          />
        </label>
      </div>
      <ul v-if="visible(issues.params).length" class="issues">
        <li v-for="issue in visible(issues.params)" :key="issue.path + issue.message">{{ issue.path }} {{ issue.message }}</li>
      </ul>
    </section>

    <section class="part">
      <h3 class="label">
        Query
        <button class="link" type="button" @click="addRow(draft.query)">Add</button>
      </h3>
      <div v-if="draft.query.length" class="rows">
        <div v-for="(pair, index) in draft.query" :key="index" class="row" :class="{ fixed: declared(model.query, pair, index) }">
          <span v-if="declared(model.query, pair, index)" class="mono key">
            {{ pair.name }}<span v-if="declared(model.query, pair, index)?.required" class="req" title="Required">*</span>
          </span>
          <input v-else v-model="pair.name" class="field" type="text" spellcheck="false" placeholder="name" aria-label="Name" />
          <input
            v-model="pair.value"
            class="field"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :placeholder="hintOf(declared(model.query, pair, index)?.schema) || 'value'"
            aria-label="Value"
          />
          <button
            v-if="!declared(model.query, pair, index)"
            class="close"
            type="button"
            title="Remove"
            @click="draft.query.splice(index, 1)"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <ul v-if="visible(issues.query).length" class="issues">
        <li v-for="issue in visible(issues.query)" :key="issue.path + issue.message">{{ issue.path }} {{ issue.message }}</li>
      </ul>
    </section>

    <section class="part">
      <h3 class="label">
        Headers
        <button class="link" type="button" @click="addRow(draft.headers)">Add</button>
      </h3>
      <div v-if="draft.headers.length" class="rows">
        <div
          v-for="(pair, index) in draft.headers"
          :key="index"
          class="row"
          :class="{ fixed: declared(model.headers, pair, index) }"
        >
          <span v-if="declared(model.headers, pair, index)" class="mono key">{{ pair.name }}</span>
          <input v-else v-model="pair.name" class="field" type="text" spellcheck="false" placeholder="name" aria-label="Name" />
          <input
            v-model="pair.value"
            class="field"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="value"
            aria-label="Value"
          />
          <button
            v-if="!declared(model.headers, pair, index)"
            class="close"
            type="button"
            title="Remove"
            @click="draft.headers.splice(index, 1)"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>

    <section v-if="draft.cookies.length" class="part">
      <h3 class="label">Cookies</h3>
      <div class="rows">
        <label v-for="pair in draft.cookies" :key="pair.name" class="row fixed">
          <span class="mono key">{{ pair.name }}</span>
          <input v-model="pair.value" class="field" type="text" spellcheck="false" autocomplete="off" placeholder="value" />
        </label>
      </div>
    </section>

    <section v-if="draft.method !== 'GET' && draft.method !== 'HEAD'" class="part">
      <h3 class="label">
        Body
        <button v-if="model.bodySchema !== undefined" class="link" type="button" @click="resetBody">Reset to example</button>
      </h3>
      <div class="modes" role="radiogroup" aria-label="Body format">
        <button
          v-for="mode in BODY_MODES"
          :key="mode.id"
          class="mode"
          :class="{ on: draft.bodyMode === mode.id }"
          type="button"
          role="radio"
          :aria-checked="draft.bodyMode === mode.id"
          @click="draft.bodyMode = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>

      <textarea
        v-if="draft.bodyMode === 'json' || draft.bodyMode === 'text'"
        v-model="draft.body"
        class="editor"
        :class="{ bad: visible(issues.body).length > 0 }"
        spellcheck="false"
        autocomplete="off"
        :rows="Math.min(16, Math.max(5, draft.body.split('\n').length + 1))"
        :placeholder="draft.bodyMode === 'json' ? '{ }' : 'Plain text'"
        aria-label="Request body"
      />

      <template v-else-if="draft.bodyMode === 'form'">
        <div v-if="draft.form.length" class="rows">
          <div v-for="(pair, index) in draft.form" :key="index" class="row">
            <input v-model="pair.name" class="field" type="text" spellcheck="false" placeholder="field" aria-label="Field" />
            <input v-model="pair.value" class="field" type="text" spellcheck="false" placeholder="value" aria-label="Value" />
            <button class="close" type="button" title="Remove" @click="draft.form.splice(index, 1)">
              <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <button class="link start" type="button" @click="addRow(draft.form)">Add field</button>
      </template>

      <ul v-if="visible(issues.body).length" class="issues">
        <li v-for="issue in visible(issues.body)" :key="issue.path + issue.message">{{ formatIssue(issue) }}</li>
      </ul>
      <p v-else-if="model.bodySchema !== undefined && draft.bodyMode === 'json'" class="hint">
        Matches the schema of this route.
      </p>
    </section>

    <section class="part">
      <h3 class="label">
        Credentials
        <span v-if="route.secured" class="tag amber">secured</span>
      </h3>
      <div class="row wide">
        <select v-model="auth.kind" class="field" aria-label="Kind of credentials">
          <option v-for="kind in AUTH_KINDS" :key="kind.id" :value="kind.id">{{ kind.label }}</option>
        </select>
      </div>

      <div v-if="auth.kind === 'bearer'" class="row wide">
        <input v-model="auth.token" class="field" type="password" autocomplete="off" placeholder="token" aria-label="Token" />
      </div>
      <div v-else-if="auth.kind === 'basic'" class="row pair">
        <input v-model="auth.username" class="field" type="text" autocomplete="off" placeholder="user" aria-label="User" />
        <input
          v-model="auth.password"
          class="field"
          type="password"
          autocomplete="off"
          placeholder="password"
          aria-label="Password"
        />
      </div>
      <div v-else-if="auth.kind === 'apikey'" class="row pair">
        <input v-model="auth.keyName" class="field" type="text" spellcheck="false" placeholder="header" aria-label="Header" />
        <input v-model="auth.keyValue" class="field" type="password" autocomplete="off" placeholder="key" aria-label="Key" />
      </div>
      <div v-else-if="auth.kind === 'cookie'" class="row pair">
        <input v-model="auth.cookieName" class="field" type="text" spellcheck="false" placeholder="name" aria-label="Cookie" />
        <input
          v-model="auth.cookieValue"
          class="field"
          type="password"
          autocomplete="off"
          placeholder="value"
          aria-label="Cookie value"
        />
      </div>

      <template v-if="auth.kind !== 'none'">
        <label class="check">
          <input v-model="useAuth" type="checkbox" />
          Send with this request
        </label>
        <label class="check">
          <input v-model="auth.remember" type="checkbox" />
          Remember on this device
        </label>
        <p class="hint">
          {{
            auth.remember
              ? 'Kept in the local storage of this browser until you untick the box.'
              : 'Kept in memory until the page is closed.'
          }}
        </p>
      </template>
    </section>

    <section class="part send">
      <div v-if="armed" class="confirm" @keydown.esc="armed = false">
        <p class="what">
          <span class="mono verb" :class="{ destroy: draft.method === 'DELETE' }">{{ draft.method }}</span>
          <code class="url">{{ origin }}{{ preview.request.target }}</code>
        </p>
        <p v-if="needsConfirmation(draft.method)" class="hint">This request can change data. Check the URL, then send it.</p>
        <p v-if="problemCount" class="hint warn">
          {{ problemCount }} {{ problemCount === 1 ? 'problem' : 'problems' }} above. The server will probably refuse it.
        </p>
        <div class="buttons">
          <button ref="confirmButton" class="btn" :class="{ danger: draft.method === 'DELETE' }" type="button" @click="send">
            Send {{ draft.method }}
          </button>
          <button class="btn ghost" type="button" @click="armed = false">Cancel</button>
        </div>
      </div>

      <div v-else class="buttons">
        <button v-if="busy" class="btn" type="button" @click="stop">Stop</button>
        <button v-else class="btn primary" type="button" :disabled="touched && preview.missing.length > 0" @click="requestSend">
          Send
        </button>
        <button class="btn ghost" type="button" @click="copy('curl')">{{ copied === 'curl' ? 'Copied' : 'Copy as curl' }}</button>
        <button class="btn ghost" type="button" @click="copy('fetch')">
          {{ copied === 'fetch' ? 'Copied' : 'Copy as fetch' }}
        </button>
      </div>

      <label v-if="useAuth && hasCredentials(auth)" class="check">
        <input v-model="includeCredentials" type="checkbox" />
        Include credentials in copies
      </label>
    </section>

    <section v-if="result" class="part response">
      <h3 class="label">
        Response
        <span class="mono faint sent">{{ result.method }} {{ result.target }}</span>
      </h3>

      <div class="readout">
        <span v-if="result.status !== undefined" class="status big" :class="statusClass(result.status)">{{ result.status }}</span>
        <span v-if="result.statusText" class="reason">{{ result.statusText }}</span>
        <span v-if="phaseLabel" class="phase" :class="result.phase">{{ phaseLabel }}</span>
        <span class="figures mono">
          <span v-if="result.headersMs !== undefined" title="Time until the response headers arrived">
            {{ formatMs(result.headersMs) }}
          </span>
          <span v-if="result.totalMs !== undefined && result.kind !== 'empty'" title="Time until the body ended">
            {{ formatMs(result.totalMs) }} total
          </span>
          <span v-if="result.size > 0">{{ formatBytes(result.size) }}</span>
        </span>
      </div>

      <p v-if="result.error" class="failure">
        {{ result.error }}. The request did not get a response: the server is down, the connection was refused, or the browser
        blocked it.
      </p>
      <p v-if="result.redirectedTo" class="hint">Redirected to <code>{{ result.redirectedTo }}</code></p>

      <div class="buttons">
        <button
          class="btn"
          type="button"
          :disabled="result.recorded !== 'yes'"
          :title="
            result.recorded === 'yes'
              ? 'Open this request, with its trace and its logs, in the Requests view'
              : 'The request shows up here once its trace has ended'
          "
          @click="result.recordId && emit('open-request', result.recordId)"
        >
          Open in Requests
        </button>
        <button
          v-if="result.headers.length"
          class="btn ghost"
          :class="{ active: showHeaders }"
          type="button"
          @click="showHeaders = !showHeaders"
        >
          Headers
          <span class="mono faint">{{ result.headers.length }}</span>
        </button>
        <a v-if="result.download" class="btn ghost" :href="result.download.url" :download="result.download.name">
          Download {{ formatBytes(result.size) }}
        </a>
      </div>

      <p v-if="result.recorded === 'no'" class="hint">
        Devtools did not record this request. Request tracking is off, the path is excluded from telemetry, or trace propagation
        and header capture are both turned off.
      </p>
      <p v-else-if="result.phase === 'streaming'" class="hint">
        The trace of a stream ends when the stream does. Stop it to open the request.
      </p>

      <dl v-if="showHeaders" class="kv">
        <template v-for="[name, value] in result.headers" :key="name">
          <dt class="mono">{{ name }}</dt>
          <dd class="mono">{{ value }}</dd>
        </template>
      </dl>

      <ol v-if="result.kind === 'events'" class="events">
        <li v-if="result.dropped" class="faint">{{ result.dropped }} earlier events are no longer shown.</li>
        <li v-for="(event, index) in result.events" :key="`${event.at}-${index}`">
          <span class="mono faint at">{{ formatClock(event.at) }}</span>
          <span class="mono name">{{ event.event }}</span>
          <span class="mono data">{{ event.data || (event.retry === undefined ? '' : `retry ${event.retry}ms`) }}</span>
        </li>
        <li v-if="!result.events.length" class="faint">Connected. No event yet.</li>
      </ol>
      <pre v-else-if="result.kind === 'text'" class="code">{{ result.text }}</pre>
      <p v-else-if="result.kind === 'binary'" class="hint">Binary body, not decoded.</p>
      <p v-else-if="result.phase === 'done'" class="hint">Empty body.</p>

      <p v-if="result.truncated" class="hint">
        Showing the first {{ formatBytes(result.text.length) }} of {{ formatBytes(result.size) }}.
      </p>
    </section>

    <section class="part">
      <h3 class="label">
        Saved
        <button v-if="!saving" class="link" type="button" @click="saving = true">Save this request</button>
      </h3>
      <form v-if="saving" class="row pair" @submit.prevent="save">
        <input v-model="saveName" class="field sans" type="text" placeholder="Name" aria-label="Name of the saved request" />
        <span class="buttons">
          <button class="btn" type="submit">Save</button>
          <button class="btn ghost" type="button" @click="saving = false">Cancel</button>
        </span>
      </form>
      <ul v-if="saved.length" class="entries">
        <li v-for="entry in saved" :key="entry.id">
          <button class="entry" type="button" title="Load into the form. Nothing is sent." @click="restore(entry)">
            <span class="mono faint verb">{{ entry.method }}</span>
            <span class="title">{{ entry.name }}</span>
          </button>
          <button class="close" type="button" title="Remove" @click="removeEntry(entry)">
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </li>
      </ul>
      <p v-else-if="!saving" class="hint">Nothing saved for this route.</p>
    </section>

    <section v-if="recent.length" class="part">
      <h3 class="label">
        History
        <button class="link" type="button" @click="clearHistory">Clear</button>
      </h3>
      <ul class="entries">
        <li v-for="entry in recent" :key="entry.id">
          <button class="entry" type="button" title="Load into the form. Nothing is sent." @click="restore(entry)">
            <span class="status" :class="statusClass(entry.status ?? 0)">{{ entry.status ?? '---' }}</span>
            <span class="mono faint verb">{{ entry.method }}</span>
            <span class="mono title">{{ entry.target }}</span>
            <span class="mono faint">{{ formatClock(entry.at) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.playground {
  display: grid;
  gap: 18px;
  align-content: start;
  min-width: 0;
}

.part {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.part > .label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 18px;
}

.target,
.what {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
  padding: 9px 10px;
  border: 1px solid var(--edge);
  background: var(--void);
}

.verb {
  flex: none;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-2);
}

select.verb {
  width: auto;
  height: 24px;
  padding: 0 4px;
  align-self: center;
}

.verb.destroy {
  color: var(--err);
}

.url {
  min-width: 0;
  font-size: 12px;
  color: var(--text);
  overflow-wrap: anywhere;
}

.rows {
  display: grid;
  gap: 4px;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) 22px;
  align-items: center;
  gap: 6px;
}

.row.wide {
  grid-template-columns: minmax(0, 1fr);
}

.row.pair,
.row.fixed {
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
}

.key {
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.req {
  margin-left: 2px;
  color: var(--warn);
}

.field.sans {
  font-family: var(--sans);
  font-size: 12.5px;
}

select.field {
  appearance: none;
  padding-right: 24px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--text-3) 50%), linear-gradient(135deg, var(--text-3) 50%, transparent 50%);
  background-position:
    calc(100% - 13px) 13px,
    calc(100% - 9px) 13px;
  background-size:
    4px 4px,
    4px 4px;
  background-repeat: no-repeat;
}

.link {
  padding: 0;
  font-family: var(--sans);
  font-size: 11.5px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text-2);
  text-decoration: underline;
  text-decoration-color: var(--edge-strong);
  text-underline-offset: 3px;
}

.link:hover {
  color: var(--text);
}

.link.start {
  justify-self: start;
}

.modes {
  display: flex;
  border-bottom: 1px solid var(--edge);
}

.mode {
  height: 26px;
  padding: 0 10px;
  margin-bottom: -1px;
  border-bottom: 1px solid transparent;
  font-size: 12px;
  color: var(--text-3);
}

.mode:hover {
  color: var(--text-2);
}

.mode.on {
  color: var(--text);
  border-bottom-color: var(--text);
}

.editor {
  width: 100%;
  min-height: 96px;
  padding: 9px 10px;
  border: 1px solid var(--edge);
  border-radius: 0;
  background: var(--void);
  color: var(--text);
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.6;
  tab-size: 2;
  resize: vertical;
  outline: none;
}

.editor:focus {
  border-color: var(--brand-edge);
}

.editor.bad {
  border-color: color-mix(in srgb, var(--warn) 55%, transparent);
}

.issues {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--warn);
}

.hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.hint.warn {
  color: var(--warn);
}

.hint code {
  font-size: 11px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}

.check input {
  appearance: none;
  display: grid;
  place-items: center;
  width: 13px;
  height: 13px;
  margin: 0;
  border: 1px solid var(--edge-strong);
  background: var(--void);
  cursor: pointer;
}

.check input:checked {
  border-color: var(--text-2);
}

.check input:checked::after {
  content: '';
  width: 7px;
  height: 7px;
  background: var(--text);
}

.send {
  padding-top: 14px;
  border-top: 1px solid var(--edge);
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.danger {
  border-color: color-mix(in srgb, var(--err) 55%, transparent);
  color: var(--err);
}

.btn.danger:hover {
  border-color: var(--err);
  background: var(--err-tint);
}

.confirm {
  display: grid;
  gap: 8px;
}

.response {
  padding-top: 14px;
  border-top: 1px solid var(--edge);
}

.sent {
  min-width: 0;
  font-size: 10.5px;
  letter-spacing: normal;
  text-transform: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readout {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.status.big {
  font-size: 22px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.02em;
}

.reason {
  font-size: 12.5px;
  color: var(--text-2);
}

.phase {
  font-size: 12px;
  color: var(--text-3);
}

.phase.streaming {
  color: var(--ok);
}

.phase.failed {
  color: var(--err);
}

.figures {
  display: flex;
  gap: 12px;
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-2);
}

.failure {
  margin: 0;
  font-size: 12px;
  color: var(--err);
}

.kv {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: 4px 14px;
  margin: 0;
  font-size: 11.5px;
}

.kv dt {
  color: var(--text-3);
}

.kv dd {
  margin: 0;
  color: var(--text-2);
  word-break: break-all;
}

.events {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 340px;
  overflow: auto;
  border: 1px solid var(--edge);
  background: var(--void);
}

.events li {
  display: grid;
  grid-template-columns: 58px minmax(0, 112px) minmax(0, 1fr);
  gap: 9px;
  align-items: baseline;
  padding: 5px 10px;
  font-size: 11.5px;
}

.events li.faint {
  display: block;
}

.events li + li {
  border-top: 1px solid var(--edge-soft);
}

.events .at {
  font-size: 10.5px;
}

.events .name {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.events .data {
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}

.entries li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.entries li + li {
  border-top: 1px solid var(--edge-soft);
}

.entry {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 9px;
  min-width: 0;
  height: 28px;
  padding: 0;
  text-align: left;
  font-size: 12px;
  color: var(--text-2);
}

.entry:hover .title {
  color: var(--text);
}

.entry .title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.12s ease;
}

.entry .mono {
  font-size: 11.5px;
}

.entry .verb {
  font-size: 10.5px;
}
</style>
