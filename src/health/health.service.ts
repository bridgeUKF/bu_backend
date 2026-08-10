import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { RedisHealthService } from '../infrastructure/redis/redis-health.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisHealthService: RedisHealthService,
    private readonly logger: PinoLogger,
  ) {}

  async getStatus() {
    const startedAt = Date.now();

    try {
      await this.prismaService.$queryRawUnsafe('SELECT 1');
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error('Unknown database health check error');

      this.logger.error(
        { err },
        'PostgreSQL connectivity check failed during health check',
      );

      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'down',
        },
        message: 'PostgreSQL connectivity check failed',
      });
    }

    try {
      await this.redisHealthService.ping();
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error('Unknown Redis health check error');

      this.logger.error(
        { err },
        'Redis connectivity check failed during health check',
      );

      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'up',
          redis: 'down',
        },
        message: 'Redis connectivity check failed',
      });
    }

    const durationMs = Date.now() - startedAt;

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        application: 'up',
        database: 'up',
        redis: 'up',
      },
      durationMs,
    };
  }
}
