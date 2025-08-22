import { describe, it, expect, beforeAll } from "vitest";
import { createTestApp } from "../../Utils/App.mock";
import { MockController } from "../../Utils/MockController.mock";
import { initializeMetadata } from "../../../src";


describe('QueryParams Decorator', () => {

  beforeAll(async () => {
    await createTestApp();
  });


  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['queryParams']).toBeDefined();
    expect(meta.__methods['queryParams'].args[0].type).toBe('query-params');
    expect(meta.__methods['queryParams'].args[0].validate).toBe(false);
    expect(meta.__methods['queryParams'].args[0].validationSchema).toBeUndefined();
  });

  it(`should add body validation to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['queryValidation']).toBeDefined();
    expect(meta.__methods['queryParamsValidation'].args[0].type).toBe('query-params');
    expect(meta.__methods['queryParamsValidation'].args[0].validate).toBe(true);
    expect(meta.__methods['queryParamsValidation'].args[0].validationSchema).toBeDefined();
  });

});

