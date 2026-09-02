import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentKind, ContentStatus, ReactionValue } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import {
  ContentList,
  ContentRecord,
  ContentRepository,
  FavoriteRecord,
  FavoriteRepository,
  ReactionCounts,
  ReactionRecord,
  ReactionRepository,
  UpdateContentData,
} from './content.repository';

export type {
  ContentList,
  ContentRecord,
  FavoriteRecord,
  ReactionRecord,
} from './content.repository';

export type CreateContentInput = {
  kind: ContentKind;
  title: string;
  body: string;
};

export type UpdateContentInput = {
  kind?: ContentKind;
  status?: ContentStatus;
  title?: string;
  body?: string;
};

export type ListPagination = {
  limit: number;
  offset: number;
};

export type SearchInput = {
  q: string;
  kind?: ContentKind;
  limit: number;
  offset: number;
};

export type FavoriteResult = {
  favorite: FavoriteRecord;
  created: boolean;
};

export type ReactionResult = {
  reaction: ReactionRecord;
} & ReactionCounts;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class ContentService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly favoriteRepository: FavoriteRepository,
    private readonly reactionRepository: ReactionRepository,
  ) {}

  create(authorId: string, input: CreateContentInput): Promise<ContentRecord> {
    return this.contentRepository.create({
      authorId,
      kind: input.kind,
      title: input.title,
      body: input.body,
    });
  }

  listPublished(
    pagination: ListPagination & { kind?: ContentKind },
  ): Promise<ContentList> {
    return this.contentRepository.list({
      status: ContentStatus.PUBLISHED,
      kind: pagination.kind,
      ...this.normalizePagination(pagination),
    });
  }

  listMine(authorId: string, pagination: ListPagination): Promise<ContentList> {
    return this.contentRepository.list({
      authorId,
      ...this.normalizePagination(pagination),
    });
  }

  async getById(id: string, viewer: AuthenticatedUser): Promise<ContentRecord> {
    const item = await this.contentRepository.findById(id);

    if (!item) {
      throw new NotFoundException('Content not found');
    }

    if (
      item.status !== ContentStatus.PUBLISHED &&
      !this.canModerate(viewer) &&
      item.authorId !== viewer.id
    ) {
      throw new ForbiddenException('Access denied');
    }

    return item;
  }

  async update(
    id: string,
    viewer: AuthenticatedUser,
    input: UpdateContentInput,
  ): Promise<ContentRecord> {
    const item = await this.contentRepository.findById(id);

    if (!item) {
      throw new NotFoundException('Content not found');
    }

    const isAuthor = item.authorId === viewer.id;

    if (!isAuthor && !this.canModerate(viewer)) {
      throw new ForbiddenException('Access denied');
    }

    if (
      input.status &&
      input.status !== item.status &&
      !this.canModerate(viewer) &&
      !this.isAuthorTransition(item.status, input.status)
    ) {
      throw new BadRequestException('Invalid status transition');
    }

    const data: UpdateContentData = {};

    if (input.kind) {
      data.kind = input.kind;
    }

    if (input.status && input.status !== item.status) {
      data.status = input.status;
    }

    if (input.title) {
      data.title = input.title;
    }

    if (input.body) {
      data.body = input.body;
    }

    return this.contentRepository.update(id, data);
  }

  async remove(id: string, viewer: AuthenticatedUser): Promise<void> {
    const item = await this.contentRepository.findById(id);

    if (!item) {
      throw new NotFoundException('Content not found');
    }

    const isAuthorDraft =
      item.authorId === viewer.id && item.status === ContentStatus.DRAFT;
    const isAdmin = viewer.roles.includes('ADMIN');

    if (!isAuthorDraft && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    await this.contentRepository.remove(id);
  }

  searchPublished(input: SearchInput): Promise<ContentList> {
    return this.contentRepository.search({
      q: input.q,
      kind: input.kind,
      ...this.normalizePagination(input),
    });
  }

  async addFavorite(
    userId: string,
    contentId: string,
  ): Promise<FavoriteResult> {
    await this.requirePublished(contentId);

    const existing = await this.favoriteRepository.findFavorite(
      userId,
      contentId,
    );

    if (existing) {
      return { favorite: existing, created: false };
    }

    const favorite = await this.favoriteRepository.createFavorite(
      userId,
      contentId,
    );

    return { favorite, created: true };
  }

  removeFavorite(userId: string, contentId: string): Promise<void> {
    return this.favoriteRepository.removeFavorite(userId, contentId);
  }

  listFavorites(
    userId: string,
    pagination: ListPagination,
  ): Promise<ContentList> {
    return this.favoriteRepository.listFavorites(
      userId,
      this.normalizePagination(pagination),
    );
  }

  async setReaction(
    userId: string,
    contentId: string,
    value: ReactionValue,
  ): Promise<ReactionResult> {
    await this.requirePublished(contentId);

    return this.reactionRepository.upsertReactionAndRecount(
      userId,
      contentId,
      value,
    );
  }

  removeReaction(userId: string, contentId: string): Promise<ReactionCounts> {
    return this.reactionRepository.removeReactionAndRecount(userId, contentId);
  }

  private async requirePublished(contentId: string): Promise<ContentRecord> {
    const item = await this.contentRepository.findById(contentId);

    if (!item) {
      throw new NotFoundException('Content not found');
    }

    if (item.status !== ContentStatus.PUBLISHED) {
      throw new ForbiddenException('Access denied');
    }

    return item;
  }

  private canModerate(viewer: AuthenticatedUser): boolean {
    return viewer.roles.includes('MODERATOR') || viewer.roles.includes('ADMIN');
  }

  private isAuthorTransition(from: ContentStatus, to: ContentStatus): boolean {
    if (from === ContentStatus.DRAFT) {
      return to === ContentStatus.PUBLISHED || to === ContentStatus.ARCHIVED;
    }

    if (from === ContentStatus.PUBLISHED) {
      return to === ContentStatus.ARCHIVED;
    }

    return to === ContentStatus.DRAFT;
  }

  private normalizePagination(pagination: ListPagination): ListPagination {
    const limit = Math.min(
      Math.max(pagination.limit || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(pagination.offset || 0, 0);

    return { limit, offset };
  }
}
