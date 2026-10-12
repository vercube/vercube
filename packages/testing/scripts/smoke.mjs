// Smoke test for runtimes and runners the repository CI does not cover. It
// uses `node:test` and `node:assert`, which Node, Bun and Deno all provide, and
// plain JavaScript with decorators applied by hand, so nothing needs a
// transpiler. It runs against the built package: `pnpm build` first.
//
//   node --test ./scripts/smoke.mjs
//   bun test --tsconfig-override scripts/tsconfig.json ./scripts/smoke.mjs
//   deno test --allow-all ./scripts/smoke.mjs
//
// Bun would otherwise follow the `paths` of the root tsconfig to the sources
// and transpile them itself, which is not what an application gets from npm.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Controller, Get, Param } from '@vercube/core';
import { Inject } from '@vercube/di';
import { createTestApp, stub } from '@vercube/testing';

class Greeter {
  greet(name) {
    return `hello ${name}`;
  }
}

class GreetController {
  greet(name) {
    return { message: this.greeter.greet(name) };
  }
}

Inject(Greeter)(GreetController.prototype, 'greeter');
Param('name')(GreetController.prototype, 'greet', 0);
Get('/:name')(GreetController.prototype, 'greet', Object.getOwnPropertyDescriptor(GreetController.prototype, 'greet'));
Controller('/greet')(GreetController);

test('serves a request with an override', async () => {
  const app = await createTestApp({
    controllers: [GreetController],
    overrides: [[Greeter, stub({ greet: (name) => `hi ${name}` }, 'Greeter')]],
  });

  try {
    const res = await app.get('/greet/ada').expect(200).expect('content-type', /json/);
    assert.deepEqual(await res.json(), { message: 'hi ada' });
  } finally {
    await app.close();
  }
});

test('fails with the exchange in the message', async () => {
  const app = await createTestApp({ controllers: [GreetController], providers: [Greeter] });

  try {
    await assert.rejects(app.get('/nope').expect(200), /Expected status 200, got 404\n\n {2}GET http:\/\/localhost\/nope/);
  } finally {
    await app.close();
  }
});
