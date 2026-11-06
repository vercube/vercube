// The route map: which routes exist and which handler serves each.
// Written by hand here; `vercube typegen` writes the same file for you.

import type { ClockController } from '../src/controller/ClockController.js';
import type { TodoController } from '../src/controller/TodoController.js';
import type { RouteDef } from '@vercube/client';

export interface VercubeRoutes {
  'GET /api/clock': RouteDef<ClockController, 'ticks', { sse: true }>;
  'GET /api/todos': RouteDef<TodoController, 'list', { query: { done: 0 } }>;
  'GET /api/todos/:id': RouteDef<TodoController, 'get', { param: { id: 0 } }>;
  'POST /api/todos': RouteDef<TodoController, 'create', { body: 0 }>;
  'DELETE /api/todos/:id': RouteDef<TodoController, 'remove', { param: { id: 0 } }>;
}
