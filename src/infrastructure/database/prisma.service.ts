import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      datasourceUrl: configService.get<string>('app.databaseUrl'),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
