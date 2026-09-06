import { ZodError } from 'zod';
import { validateEnv } from './env.validation';

const validConfig = {
  DATABASE_URL: 'postgresql://bridgesk:bridgesk@localhost:5432/bridgesk_db',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  FRONTEND_URL: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const result = validateEnv({ ...validConfig });

    expect(result).toMatchObject({
      PORT: 3001,
      STORAGE_DRIVER: 'stub',
      SWAGGER_ENABLED: 'true',
      LOG_LEVEL: 'info',
    });
  });

  it('fails fast on empty secrets (fail-fast, not silent)', () => {
    expect(() =>
      validateEnv({ ...validConfig, JWT_ACCESS_SECRET: '' }),
    ).toThrow(ZodError);
    expect(() => validateEnv({ ...validConfig, DATABASE_URL: '' })).toThrow(
      ZodError,
    );
    expect(() =>
      validateEnv({ ...validConfig, JWT_REFRESH_SECRET: '' }),
    ).toThrow(ZodError);
  });

  it('rejects malformed urls and enums', () => {
    expect(() =>
      validateEnv({ ...validConfig, FRONTEND_URL: 'not-a-url' }),
    ).toThrow(ZodError);
    expect(() => validateEnv({ ...validConfig, STORAGE_DRIVER: 's3' })).toThrow(
      ZodError,
    );
    expect(() => validateEnv({ ...validConfig, LOG_LEVEL: 'verbose' })).toThrow(
      ZodError,
    );
  });

  it('accepts a fully configured r2 driver', () => {
    const result = validateEnv({
      ...validConfig,
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'test-account',
      R2_ACCESS_KEY_ID: 'test-access',
      R2_SECRET_ACCESS_KEY: 'test-secret',
      R2_BUCKET_NAME: 'bridgeukf',
      R2_PUBLIC_URL: 'https://pub-test.r2.dev',
    });

    expect(result).toMatchObject({ STORAGE_DRIVER: 'r2' });
  });
});
