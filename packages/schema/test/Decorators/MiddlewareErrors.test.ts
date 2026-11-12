import {
  addMetadataMiddleware,
  BaseMiddleware,
  Controller,
  createApp,
  Get,
  GlobalMiddlewareRegistry,
  initializeMetadata,
  initializeMetadataMethod,
  TooManyRequestsError,
} from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { Schema, SchemaPlugin } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';
import type { MetadataTypes } from '@vercube/core';

/** A limiter in the shape `@vercube/ratelimit` has: slotted, declaring its 429. */
class Limiter extends BaseMiddleware {
  public static readonly implicitErrors = [{ error: TooManyRequestsError, module: '@vercube/core' }];

  public override onRequest(): void {}
}

/** Lifts the limiter from a method. */
function Unlimited(): Function {
  return (target: object, propertyName: string): void => {
    const meta = initializeMetadata(target);

    initializeMetadataMethod(target as MetadataTypes.Metadata, propertyName);
    addMetadataMiddleware(meta, {
      target: propertyName,
      middleware: Limiter,
      slot: 'limit',
      skip: true,
    });
  };
}

@Controller('/api')
class ApiController {
  @Get('/limited')
  @Schema({})
  public limited() {
    return {};
  }

  @Get('/unlimited')
  @Unlimited()
  @Schema({})
  public unlimited() {
    return {};
  }
}

describe('errors declared by middlewares', () => {
  it('should document the 429 on routes the middleware runs on, and not where a slot lifts it', async () => {
    const app = await createApp({
      cfg: { requestLogging: false },
      setup: async (instance) => {
        instance.addPlugin(SchemaPlugin, {});
        instance.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(Limiter, { slot: 'limit' });
      },
    });

    app.container.expand((container) => container.bind(ApiController));

    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(Object.keys(schema.paths['/api/limited']?.get?.responses ?? {})).toContain('429');
    expect(Object.keys(schema.paths['/api/unlimited']?.get?.responses ?? {})).not.toContain('429');
  });
});
