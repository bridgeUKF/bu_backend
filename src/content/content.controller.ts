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
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { ListContentDto } from './dto/list-content.dto';
import { SearchContentDto } from './dto/search-content.dto';
import { SetReactionDto } from './dto/set-reaction.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@ApiTags('content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'content',
  version: '1',
})
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create content (always DRAFT)' })
  @ApiCreatedResponse({ description: 'Created DRAFT ContentItem' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  create(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() createContentDto: CreateContentDto,
  ) {
    return this.contentService.create(authUser.id, createContentDto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List own content (any status), newest first' })
  @ApiOkResponse({ description: '{ items, total }' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  listMine(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListContentDto,
  ) {
    return this.contentService.listMine(authUser.id, {
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  @Get('favorites/mine')
  @ApiOperation({ summary: 'List own favorites (any status)' })
  @ApiOkResponse({ description: '{ items, total }' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  listFavorites(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListContentDto,
  ) {
    return this.contentService.listFavorites(authUser.id, {
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search PUBLISHED content (ILIKE title/body)' })
  @ApiOkResponse({ description: '{ items, total }' })
  @ApiBadRequestResponse({
    description: 'Validation failed (q required, 2–200)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  search(@Query() query: SearchContentDto) {
    return this.contentService.searchPublished({
      q: query.q,
      kind: query.kind,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List PUBLISHED content, newest first' })
  @ApiOkResponse({ description: '{ items, total }' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  list(@Query() query: ListContentDto) {
    return this.contentService.listPublished({
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      kind: query.kind,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get content by id (PUBLISHED public; drafts restricted)',
  })
  @ApiOkResponse({ description: 'ContentItem' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  @ApiForbiddenResponse({ description: 'No access to this content' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  getById(@CurrentUser() authUser: AuthenticatedUser, @Param('id') id: string) {
    return this.contentService.getById(id, authUser);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update content (author transitions or moderator/admin any)',
  })
  @ApiOkResponse({ description: 'Updated ContentItem' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  @ApiForbiddenResponse({ description: 'No access to update' })
  @ApiBadRequestResponse({
    description: 'Illegal status transition / validation failed',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  update(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
  ) {
    return this.contentService.update(id, authUser, updateContentDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete content (author DRAFT only, ADMIN any)' })
  @ApiOkResponse({ description: '{}' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  @ApiForbiddenResponse({ description: 'No access to delete' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  async remove(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.contentService.remove(id, authUser);

    return {};
  }

  @Post(':id/favorite')
  @ApiOperation({
    summary: 'Add favorite (idempotent: 201 created, 200 repeat)',
  })
  @ApiCreatedResponse({ description: '{ favorite } (first time)' })
  @ApiOkResponse({ description: '{ favorite } (repeat)' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  @ApiForbiddenResponse({ description: 'Only PUBLISHED can be favorited' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  async addFavorite(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { favorite, created } = await this.contentService.addFavorite(
      authUser.id,
      id,
    );

    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);

    return { favorite };
  }

  @Delete(':id/favorite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove favorite (idempotent)' })
  @ApiOkResponse({ description: '{}' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  async removeFavorite(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.contentService.removeFavorite(authUser.id, id);

    return {};
  }

  @Put(':id/reaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set reaction (upsert LIKE/DISLIKE)' })
  @ApiOkResponse({ description: '{ reaction, likeCount, dislikeCount }' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  @ApiForbiddenResponse({ description: 'Only PUBLISHED can be reacted to' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  setReaction(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() setReactionDto: SetReactionDto,
  ) {
    return this.contentService.setReaction(
      authUser.id,
      id,
      setReactionDto.value,
    );
  }

  @Delete(':id/reaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove reaction (idempotent)' })
  @ApiOkResponse({ description: '{ likeCount, dislikeCount }' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  removeReaction(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.contentService.removeReaction(authUser.id, id);
  }
}
