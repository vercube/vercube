import { describe, expect, it } from 'vitest';
import { extractControllers, IMPORT_SOURCE } from '../src/Extract';

describe('extractControllers', () => {
  it('returns an empty array when no controllers are found', () => {
    expect(extractControllers(`export class Foo {}`)).toEqual([]);
  });

  it('discovers every @Controller class, including WebSocket-only ones', () => {
    const code = `
      @Controller('/users')
      export class UserController {
        @Get('/')
        list() {}
      }

      @Namespace('/chat')
      @Controller('/api/chat')
      export default class ChatController {
        @Message({ event: 'ping' })
        ping() {}
      }
    `;
    const controllers = extractControllers(code);
    expect(controllers).toHaveLength(2);
    expect(controllers[0]).toMatchObject({
      importClassName: 'UserController',
      import: `import { UserController } from '${IMPORT_SOURCE}';`,
    });
    expect(controllers[1]).toMatchObject({
      importClassName: 'ChatController',
      import: `import ChatController from '${IMPORT_SOURCE}';`,
    });
  });

  it('ignores anonymous default-export classes', () => {
    const code = `
      @Controller('/api')
      export default class {
        @Get('/foo')
        foo() {}
      }
    `;
    expect(extractControllers(code)).toEqual([]);
  });
});
