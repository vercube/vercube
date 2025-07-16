import { beforeAll, describe, expect, it } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { Emit } from '../../src/Decorators/Emit';

class EmitService {
  @Emit()
  public sendMessage(content: string) {
    return { content };
  }
}

class NoEmitService {
  public sendMessage(content: string) {
    return { content };
  }
}

describe('@Emit() decorator', () => {
  let container: Container;
  let emitService: EmitService;
  let noEmitService: NoEmitService;

  beforeAll(() => {
    container = new Container();
    container.bind(EmitService);
    container.bind(NoEmitService);
    initializeContainer(container);

    emitService = container.get(EmitService);
    noEmitService = container.get(NoEmitService);
  });

  it('should have emit arg if method is decorated with @Emit()', async () => {
    initializeMetadata(emitService);
    const methodMeta = initializeMetadataMethod(emitService, 'sendMessage');
    const shouldEmit = methodMeta.args.some(arg => arg.type === 'emit');
    expect(shouldEmit).toBe(true);
  });

  it('should not have emit arg if no @Emit() decorator is used', async () => {
    initializeMetadata(noEmitService);
    const methodMeta = initializeMetadataMethod(noEmitService, 'sendMessage');
    const shouldEmit = methodMeta.args.some(arg => arg.type === 'emit');
    expect(shouldEmit).toBe(false);
  });
});