import { describe, expect, it } from 'vitest';
import { shouldListen } from '../../src/Utils/Listen';

describe('shouldListen', () => {
  it('should listen by default, whoever imports the entry', () => {
    expect(shouldListen({})).toBe(true);
    // PM2 imports the entry through its own wrapper
    expect(shouldListen({ pm_id: '0' })).toBe(true);
  });

  it('should not listen when VERCUBE_LISTEN turns it off', () => {
    expect(shouldListen({ VERCUBE_LISTEN: '0' })).toBe(false);
    expect(shouldListen({ VERCUBE_LISTEN: 'false' })).toBe(false);
    expect(shouldListen({ VERCUBE_LISTEN: ' FALSE ' })).toBe(false);
  });

  it('should not listen on serverless platforms', () => {
    expect(shouldListen({ VERCEL: '1' })).toBe(false);
    expect(shouldListen({ AWS_LAMBDA_FUNCTION_NAME: 'api' })).toBe(false);
    expect(shouldListen({ FUNCTIONS_WORKER_RUNTIME: 'node' })).toBe(false);
  });

  it('should listen anywhere when VERCUBE_LISTEN forces it', () => {
    expect(shouldListen({ VERCUBE_LISTEN: '1', VERCEL: '1' })).toBe(true);
    expect(shouldListen({ VERCUBE_LISTEN: 'true', AWS_LAMBDA_FUNCTION_NAME: 'api' })).toBe(true);
  });

  it('should read process.env without arguments', () => {
    expect(typeof shouldListen()).toBe('boolean');
  });
});
