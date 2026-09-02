import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentKind, ContentStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import {
  ContentList,
  ContentRecord,
  ContentRepository,
  UpdateContentData,
} from './content.repository';

export type { ContentList, ContentRecord } from './content.repository';

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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class ContentService {
  constructor(private readonly contentRepository: ContentRepository) {}

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
