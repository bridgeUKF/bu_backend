import { appConfig } from './app.config';

describe('appConfig', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('applies safe defaults when env is empty', () => {
    process.env = {};

    const config = appConfig();

    expect(config).toMatchObject({
      port: 3001,
      host: '0.0.0.0',
      apiPrefix: 'api',
      apiVersion: '1',
      storageDriver: 'stub',
      swaggerEnabled: true,
    });
  });

  it('parses comma-separated cors origins', () => {
    process.env = {
      CORS_ORIGINS: 'https://app.example.com, https://admin.example.com ',
    };

    const config = appConfig();

    expect(config.corsOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('disables swagger explicitly for production', () => {
    process.env = { SWAGGER_ENABLED: 'false' };

    expect(appConfig().swaggerEnabled).toBe(false);
  });

  it('passes r2 settings through when the r2 driver is selected', () => {
    process.env = {
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'test-account',
      R2_BUCKET_NAME: 'bridgeukf',
    };

    const config = appConfig();

    expect(config).toMatchObject({
      storageDriver: 'r2',
      r2AccountId: 'test-account',
      r2BucketName: 'bridgeukf',
    });
  });
});
