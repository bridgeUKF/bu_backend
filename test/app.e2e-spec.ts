import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './../src/app.module';
import { appConfig } from './../src/config/app.config';
import { validateEnv } from './../src/config/env.validation';
import { PrismaService } from './../src/infrastructure/database/prisma.service';
import { RedisHealthService } from './../src/infrastructure/redis/redis-health.service';

describe('HealthController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          expandVariables: true,
          load: [appConfig],
          validate: validateEnv,
        }),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ result: 1 }]),
      })
      .overrideProvider(RedisHealthService)
      .useValue({
        ping: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const configService = app.get(ConfigService);

    app.setGlobalPrefix(configService.get<string>('app.apiPrefix') ?? 'api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: configService.get<string>('app.apiVersion') ?? '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/api/v1/health (GET)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      checks: {
        application: 'up',
        database: 'up',
        redis: 'up',
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
