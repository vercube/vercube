import { BaseDecorator, createDecorator } from '@vercube/di';
import { beforeAll, describe, expect, it } from 'vitest';
import { Body, Controller, createApp, Post, Response as Res } from '../../src';
import { initializeMetadata, initializeMetadataMethod } from '../../src/Utils/Utils';
import type { App } from '../../src';
import type { MetadataTypes } from '../../src/Types/MetadataTypes';

/**
 * Minimal `custom` argument decorator: its resolver stamps a header on the
 * intermediate response and returns a value for the handler.
 */
class StampDecorator extends BaseDecorator<undefined, MetadataTypes.Metadata> {
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'custom',
      resolver: async (event) => {
        event.response.headers.set('x-stamp', 'stamped');
        return 'stamped';
      },
    });
  }
}

/**
 * Creates the `custom` argument decorator used by the tests below.
 *
 * @returns {Function} The decorator function.
 */
function Stamp(): Function {
  return createDecorator(StampDecorator, undefined);
}

@Controller('/simple')
class SimpleController {
  @Post('/two-bodies')
  public twoBodies(@Body() first: any, @Body() second: any): unknown {
    return { first, second };
  }

  @Post('/custom')
  public custom(@Stamp() stamp: string): unknown {
    return { stamp };
  }

  @Post('/response')
  public response(@Res() response: Response): unknown {
    response.headers.set('x-from-handler', 'yes');
    return { ok: true };
  }
}

describe('Routes without middlewares', () => {
  let app: App;

  beforeAll(async () => {
    // The evlog middleware is a global middleware, so it has to be off for the
    // routes under test to take the no-middleware fast path at all.
    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(SimpleController);
      },
    });
  });

  it('should let two @Body() arguments read the body', async () => {
    const response = await app.fetch(
      new globalThis.Request('http://localhost/simple/two-bodies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ first: { name: 'John' }, second: { name: 'John' } });
  });

  it('should apply a response mutation made by a custom resolver', async () => {
    const response = await app.fetch(new globalThis.Request('http://localhost/simple/custom', { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-stamp')).toBe('stamped');
    await expect(response.json()).resolves.toEqual({ stamp: 'stamped' });
  });

  it('should apply a response mutation made through @Response()', async () => {
    const response = await app.fetch(new globalThis.Request('http://localhost/simple/response', { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-from-handler')).toBe('yes');
  });
});
