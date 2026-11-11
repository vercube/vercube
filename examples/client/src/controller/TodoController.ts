import { Body, Controller, Delete, Get, NotFoundError, Param, Post, QueryParam } from '@vercube/core';

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: Date;
}

@Controller('/api/todos')
export class TodoController {
  private readonly todos = new Map<number, Todo>([
    [1, { id: 1, title: 'Try @vercube/client', done: false, createdAt: new Date() }],
  ]);
  private nextId = 2;

  @Get('/')
  public list(@QueryParam({ name: 'done' }) done?: 'true' | 'false'): Todo[] {
    const todos = [...this.todos.values()];

    return done === undefined ? todos : todos.filter((todo) => String(todo.done) === done);
  }

  @Get('/:id')
  public get(@Param('id') id: string): Todo {
    const todo = this.todos.get(Number(id));

    if (!todo) {
      throw new NotFoundError(`Todo ${id} not found`);
    }

    return todo;
  }

  @Post('/')
  public create(@Body() body: { title: string }): Todo {
    const todo = { id: this.nextId++, title: body.title, done: false, createdAt: new Date() };

    this.todos.set(todo.id, todo);

    return todo;
  }

  @Delete('/:id')
  public remove(@Param('id') id: string): void {
    this.todos.delete(Number(id));
  }
}
