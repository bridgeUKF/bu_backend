import { Injectable } from '@nestjs/common';
import {
  ContentKind,
  ContentStatus,
  Prisma,
  ReactionValue,
} from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

const contentSelect = {
  id: true,
  authorId: true,
  kind: true,
  status: true,
  title: true,
  body: true,
  likeCount: true,
  dislikeCount: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContentItemSelect;

export type ContentRecord = Prisma.ContentItemGetPayload<{
  select: typeof contentSelect;
}>;

export type CreateContentData = {
  authorId: string;
  kind: ContentKind;
  title: string;
  body: string;
};

export type UpdateContentData = {
  kind?: ContentKind;
  status?: ContentStatus;
  title?: string;
  body?: string;
};

export type ListContentQuery = {
  status?: ContentStatus;
  authorId?: string;
  kind?: ContentKind;
  limit: number;
  offset: number;
};

export type SearchContentQuery = {
  q: string;
  kind?: ContentKind;
  limit: number;
  offset: number;
};

export type ContentList = {
  items: ContentRecord[];
  total: number;
};

@Injectable()
export class ContentRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findById(id: string): Promise<ContentRecord | null> {
    return this.prismaService.contentItem.findUnique({
      where: { id },
      select: contentSelect,
    });
  }

  async list(query: ListContentQuery): Promise<ContentList> {
    const where: Prisma.ContentItemWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.authorId) {
      where.authorId = query.authorId;
    }

    if (query.kind) {
      where.kind = query.kind;
    }

    const [items, total] = await Promise.all([
      this.prismaService.contentItem.findMany({
        where,
        select: contentSelect,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prismaService.contentItem.count({ where }),
    ]);

    return { items, total };
  }

  create(data: CreateContentData): Promise<ContentRecord> {
    return this.prismaService.contentItem.create({
      data: {
        authorId: data.authorId,
        kind: data.kind,
        status: ContentStatus.DRAFT,
        title: data.title,
        body: data.body,
      },
      select: contentSelect,
    });
  }

  update(id: string, data: UpdateContentData): Promise<ContentRecord> {
    return this.prismaService.contentItem.update({
      where: { id },
      data: {
        kind: data.kind,
        status: data.status,
        title: data.title,
        body: data.body,
      },
      select: contentSelect,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prismaService.contentItem.delete({ where: { id } });
  }

  async search(query: SearchContentQuery): Promise<ContentList> {
    const where: Prisma.ContentItemWhereInput = {
      status: ContentStatus.PUBLISHED,
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { body: { contains: query.q, mode: 'insensitive' } },
      ],
    };

    if (query.kind) {
      where.kind = query.kind;
    }

    const [items, total] = await Promise.all([
      this.prismaService.contentItem.findMany({
        where,
        select: contentSelect,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prismaService.contentItem.count({ where }),
    ]);

    return { items, total };
  }
}

const favoriteSelect = {
  id: true,
  userId: true,
  contentId: true,
  createdAt: true,
} satisfies Prisma.FavoriteSelect;

export type FavoriteRecord = Prisma.FavoriteGetPayload<{
  select: typeof favoriteSelect;
}>;

const reactionSelect = {
  id: true,
  userId: true,
  contentId: true,
  value: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContentReactionSelect;

export type ReactionRecord = Prisma.ContentReactionGetPayload<{
  select: typeof reactionSelect;
}>;

export type ReactionCounts = {
  likeCount: number;
  dislikeCount: number;
};

@Injectable()
export class FavoriteRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findFavorite(
    userId: string,
    contentId: string,
  ): Promise<FavoriteRecord | null> {
    return this.prismaService.favorite.findUnique({
      where: { userId_contentId: { userId, contentId } },
      select: favoriteSelect,
    });
  }

  createFavorite(userId: string, contentId: string): Promise<FavoriteRecord> {
    return this.prismaService.favorite.create({
      data: { userId, contentId },
      select: favoriteSelect,
    });
  }

  async removeFavorite(userId: string, contentId: string): Promise<void> {
    await this.prismaService.favorite.deleteMany({
      where: { userId, contentId },
    });
  }

  async listFavorites(
    userId: string,
    pagination: { limit: number; offset: number },
  ): Promise<ContentList> {
    const where: Prisma.FavoriteWhereInput = { userId };

    const [favorites, total] = await Promise.all([
      this.prismaService.favorite.findMany({
        where,
        select: { content: { select: contentSelect } },
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      this.prismaService.favorite.count({ where }),
    ]);

    return { items: favorites.map((favorite) => favorite.content), total };
  }
}

@Injectable()
export class ReactionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async upsertReactionAndRecount(
    userId: string,
    contentId: string,
    value: ReactionValue,
  ): Promise<{ reaction: ReactionRecord } & ReactionCounts> {
    return this.prismaService.$transaction(async (prisma) => {
      const reaction = await prisma.contentReaction.upsert({
        where: { userId_contentId: { userId, contentId } },
        create: { userId, contentId, value },
        update: { value },
        select: reactionSelect,
      });

      return { reaction, ...(await this.recount(prisma, contentId)) };
    });
  }

  async removeReactionAndRecount(
    userId: string,
    contentId: string,
  ): Promise<ReactionCounts> {
    return this.prismaService.$transaction(async (prisma) => {
      await prisma.contentReaction.deleteMany({
        where: { userId, contentId },
      });

      return this.recount(prisma, contentId);
    });
  }

  private async recount(
    prisma: Prisma.TransactionClient,
    contentId: string,
  ): Promise<ReactionCounts> {
    const [likeCount, dislikeCount] = await Promise.all([
      prisma.contentReaction.count({
        where: { contentId, value: ReactionValue.LIKE },
      }),
      prisma.contentReaction.count({
        where: { contentId, value: ReactionValue.DISLIKE },
      }),
    ]);

    await prisma.contentItem.update({
      where: { id: contentId },
      data: { likeCount, dislikeCount },
    });

    return { likeCount, dislikeCount };
  }
}
