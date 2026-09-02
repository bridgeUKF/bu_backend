import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { ListContentDto } from './dto/list-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@UseGuards(JwtAuthGuard)
@Controller({
  path: 'content',
  version: '1',
})
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() createContentDto: CreateContentDto,
  ) {
    return this.contentService.create(authUser.id, createContentDto);
  }

  @Get('mine')
  listMine(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListContentDto,
  ) {
    return this.contentService.listMine(authUser.id, {
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  @Get()
  list(@Query() query: ListContentDto) {
    return this.contentService.listPublished({
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      kind: query.kind,
    });
  }

  @Get(':id')
  getById(@CurrentUser() authUser: AuthenticatedUser, @Param('id') id: string) {
    return this.contentService.getById(id, authUser);
  }

  @Patch(':id')
  update(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
  ) {
    return this.contentService.update(id, authUser, updateContentDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.contentService.remove(id, authUser);

    return {};
  }
}
