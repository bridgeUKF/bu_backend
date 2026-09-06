import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { appConfig } from './config/app.config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { ContentModule } from './content/content.module';
import { MailModule } from './mail/mail.module';
import { NotificationModule } from './notification/notification.module';
import { ProfileModule } from './profile/profile.module';
import { ReportModule } from './report/report.module';
import { StorageModule } from './storage/storage.module';
import { UserModule } from './user/user.module';

// Named throttlers apply globally unless skipped: `strict` must NOT leak onto
// regular routes, so it opts out everywhere except the auth endpoints below
// (same list as the @Throttle decorators in AuthController).
const STRICT_AUTH_ROUTES = [
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/resend-verification',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
];

const isStrictAuthRoute = (context: ExecutionContext): boolean => {
  const req = context
    .switchToHttp()
    .getRequest<{ method?: string; url?: string }>();
  const url = (req.url ?? '').split('?')[0];

  return STRICT_AUTH_ROUTES.includes(`${req.method} ${url}`);
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      expandVariables: true,
      load: [appConfig],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
        pinoHttp: {
          level: configService.get<string>('app.logLevel') ?? 'info',
          autoLogging: true,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          customProps: (req) => ({
            requestId: req.id,
          }),
          transport:
            configService.get<string>('app.nodeEnv') === 'development'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    singleLine: true,
                  },
                }
              : undefined,
        },
      }),
    }),
    AuthModule,
    DatabaseModule,
    RedisModule,
    HealthModule,
    ContentModule,
    MailModule,
    NotificationModule,
    ProfileModule,
    ReportModule,
    StorageModule,
    UserModule,
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 100 },
      {
        name: 'strict',
        ttl: 60000,
        limit: 10,
        skipIf: (context) => !isStrictAuthRoute(context),
      },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
