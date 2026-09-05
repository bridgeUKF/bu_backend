import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  APP_ENV: z.string().default('local'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1),
  FRONTEND_URL: z.string().url(),
  MAIL_FROM: z.string().min(1).default('BridgeU <no-reply@localhost>'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SWAGGER_ENABLED: z.enum(['true', 'false']).default('true'),
  SWAGGER_PATH: z.string().min(1).default('api/docs'),
  STORAGE_DRIVER: z.enum(['stub', 'r2']).default('stub'),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export const validateEnv = (
  config: Record<string, unknown>,
): Record<string, unknown> => envSchema.parse(config);
