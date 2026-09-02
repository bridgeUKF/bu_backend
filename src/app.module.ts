import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { appConfig } from './config/app.config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { ContentModule } from './content/content.module';
import { MailModule } from './mail/mail.module';
import { ProfileModule } from './profile/profile.module';
import { ReportModule } from './report/report.module';
import { UserModule } from './user/user.module';

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
    ProfileModule,
    ReportModule,
    UserModule,
  ],
})
export class AppModule {}
