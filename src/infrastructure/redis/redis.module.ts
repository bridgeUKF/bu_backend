import { Global, Module } from '@nestjs/common';
import { RedisHealthService } from './redis-health.service';

@Global()
@Module({
  providers: [RedisHealthService],
  exports: [RedisHealthService],
})
export class RedisModule {}
