// Calls the running example (`pnpm dev` in another terminal) with full types:
// paths, params, query, body and responses all come from the controllers.
import { createClient, VercubeClientError } from '@vercube/client';
import type { VercubeRoutes } from '../.vercube/routes.js';

const api = createClient<VercubeRoutes>({ baseURL: process.env.API_URL ?? 'http://localhost:3000' });

// `todo` is { id: number; title: string; done: boolean; createdAt: string }:
// the Date arrives as a string, which is what JSON carries
const todo = await api.post('/api/todos', { body: { title: 'Write the docs' } });
console.log('created', todo.id, todo.createdAt);

const open = await api.get('/api/todos', { query: { done: 'false' } });
console.log(
  'open todos',
  open.map((item) => item.title),
);

// any status that is not 2xx rejects, with the parsed body attached
try {
  await api.get('/api/todos/:id', { params: { id: '999' } });
} catch (error) {
  if (error instanceof VercubeClientError) {
    console.log('not found', error.status, error.body);
  }
}

await api.delete('/api/todos/:id', { params: { id: String(todo.id) } });

// an @Sse() route gives an async iterable of typed events
for await (const event of await api.get('/api/clock')) {
  if (event.event === 'done') {
    break;
  }

  console.log('tick', event.data.at);
}
