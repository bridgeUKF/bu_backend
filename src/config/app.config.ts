import { registerAs } from '@nestjs/config';

const parseOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const appConfig = registerAs('app', () => {
  const port = Number(process.env.PORT ?? 3001);
  const corsOrigins = parseOrigins(
    process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '',
  );

  return {
    appEnv: process.env.APP_ENV ?? 'local',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    host: process.env.HOST ?? '0.0.0.0',
    apiPrefix: 'api',
    apiVersion: '1',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    corsOrigins,
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
    swaggerPath: process.env.SWAGGER_PATH ?? 'api/docs',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  };
});
