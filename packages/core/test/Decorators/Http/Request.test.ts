import { describe, it, expect, beforeAll } from "vitest";
import { createTestApp } from "../../Utils/App.mock";
import { MockController } from "../../Utils/MockController.mock";
import { initializeMetadata } from "../../../src";


describe('Request Decorator', () => {

  beforeAll(async () => {
    await createTestApp();
  });


  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['request']).toBeDefined();
    expect(meta.__methods['request'].args[0].type).toBe('request');
  });

});

