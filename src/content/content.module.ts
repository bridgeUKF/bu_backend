import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentController } from './content.controller';
import { ContentRepository } from './content.repository';
import { ContentService } from './content.service';

@Module({
  imports: [AuthModule],
  controllers: [ContentController],
  providers: [ContentService, ContentRepository],
  exports: [ContentService],
})
export class ContentModule {}
