import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      bufferLogs: true,
    },
  );

  const configService = app.get(ConfigService);
  app.useLogger(app.get(PinoLogger));

  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    origin: configService.get<string[]>('app.corsOrigins') ?? false,
    credentials: true,
  });

  app.setGlobalPrefix(configService.get<string>('app.apiPrefix') ?? 'api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: configService.get<string>('app.apiVersion') ?? '1',
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (configService.get<boolean>('app.swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('BridgeU API')
      .setVersion('v1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup(
      configService.get<string>('app.swaggerPath') ?? 'api/docs',
      app,
      document,
    );
  }

  const port = configService.get<number>('app.port') ?? 3001;
  const host = configService.get<string>('app.host') ?? '0.0.0.0';

  await app.listen(port, host);

  Logger.log(
    `BridgeU backend listening on http://${host}:${port}/${
      configService.get<string>('app.apiPrefix') ?? 'api'
    }/v${configService.get<string>('app.apiVersion') ?? '1'}`,
    'Bootstrap',
  );
}

void bootstrap();
