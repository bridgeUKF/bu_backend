import { Injectable } from '@nestjs/common';
import { ContentKind, ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

const contentSelect = {
  id: true,
  authorId: true,
  kind: true,
  status: true,
  title: true,
  body: true,
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
}
