<script setup lang="ts">
import { onMounted, ref } from 'vue';

const greeting = ref('…');
const name = ref('World');
const wsLog = ref<string[]>([]);
let socket: WebSocket | undefined;

// HTTP: call the Vercube API served on the same origin.
async function loadGreeting() {
  const res = await fetch(`/api/hello/${encodeURIComponent(name.value)}`);
  const data = await res.json();
  greeting.value = data.message;
}

// WebSocket: connect to the Vercube `/echo` namespace and round-trip a message.
function connectWs() {
  socket = new WebSocket(`ws://${location.host}/echo`);
  socket.addEventListener('open', () => wsLog.value.push('connected'));
  socket.addEventListener('message', (e) => wsLog.value.push(`recv: ${e.data}`));
}

function sendPing() {
  socket?.send(JSON.stringify({ event: 'ping', data: { at: Date.now() } }));
  wsLog.value.push('sent: ping');
}

onMounted(() => {
  loadGreeting();
  connectWs();
});
</script>

<template>
  <main style="font-family: system-ui; max-width: 40rem; margin: 4rem auto; line-height: 1.6">
    <h1>Vercube + Vite + Vue</h1>
    <p>The page is served by Vite. The data below comes from a Vercube controller on <code>/api</code>.</p>

    <section>
      <h2>HTTP</h2>
      <label> Name: <input v-model="name" @keyup.enter="loadGreeting" /> </label>
      <button @click="loadGreeting">Fetch /api/hello</button>
      <p>
        Response: <strong>{{ greeting }}</strong>
      </p>
    </section>

    <section>
      <h2>WebSocket</h2>
      <button @click="sendPing">Send ping to /echo</button>
      <ul>
        <li v-for="(line, i) in wsLog" :key="i">{{ line }}</li>
      </ul>
    </section>
  </main>
</template>
