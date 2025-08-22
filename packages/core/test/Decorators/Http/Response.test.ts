import { describe, it, expect, beforeAll } from "vitest";
import { createTestApp } from "../../Utils/App.mock";
import { MockController } from "../../Utils/MockController.mock";
import { initializeMetadata } from "../../../src";


describe('Response Decorator', () => {

  beforeAll(async () => {
    await createTestApp();
  });


  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['response']).toBeDefined();
    expect(meta.__methods['response'].args[0].type).toBe('response');
  });

});

