import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  CORS_ORIGIN: 'http://localhost:3000',
};

describe('env loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads successfully when all required variables are present', async () => {
    Object.assign(process.env, REQUIRED_ENV);

    const { env } = await import('./env.js');

    expect(env.MONGODB_URI).toBe(REQUIRED_ENV.MONGODB_URI);
    expect(env.PORT).toBe(4000);
  });

  it('exits the process with a descriptive error when a required variable is missing', async () => {
    const { MONGODB_URI: _omit, ...rest } = REQUIRED_ENV;
    Object.assign(process.env, rest);
    delete process.env.MONGODB_URI;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await import('./env.js');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('MONGODB_URI');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
