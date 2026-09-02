import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ContentKind, ContentStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import { ContentRecord, ContentRepository } from './content.repository';
import { ContentService } from './content.service';

const authorViewer: AuthenticatedUser = {
  id: 'user-1',
  sessionId: 'session-1',
  roles: ['USER'],
  user: {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: 'ACTIVE' as const,
    emailVerifiedAt: new Date('2026-09-03T08:00:00.000Z'),
    createdAt: new Date('2026-09-03T08:00:00.000Z'),
    updatedAt: new Date('2026-09-03T08:00:00.000Z'),
  },
};

const moderatorViewer: AuthenticatedUser = {
  ...authorViewer,
  id: 'moderator-1',
  roles: ['MODERATOR'],
};

const adminViewer: AuthenticatedUser = {
  ...authorViewer,
  id: 'admin-1',
  roles: ['ADMIN'],
};

const strangerViewer: AuthenticatedUser = {
  ...authorViewer,
  id: 'stranger-1',
};

const draftItem: ContentRecord = {
  id: 'content-1',
  authorId: 'user-1',
  kind: ContentKind.ARTICLE,
  status: ContentStatus.DRAFT,
  title: 'Draft title',
  body: 'Draft body',
  createdAt: new Date('2026-09-03T08:00:00.000Z'),
  updatedAt: new Date('2026-09-03T08:00:00.000Z'),
};

const publishedItem: ContentRecord = {
  ...draftItem,
  status: ContentStatus.PUBLISHED,
  title: 'Published title',
};

describe('ContentService', () => {
  let contentService: ContentService;
  let contentRepository: {
    findById: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    contentRepository = {
      findById: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    contentService = new ContentService(
      contentRepository as unknown as ContentRepository,
    );
  });

  it('create stores a new item for the author', async () => {
    contentRepository.create.mockResolvedValue(draftItem);

    await expect(
      contentService.create('user-1', {
        title: 'Draft title',
        body: 'Draft body',
        kind: ContentKind.ARTICLE,
      }),
    ).resolves.toEqual(draftItem);

    expect(contentRepository.create.mock.calls).toEqual([
      [
        {
          authorId: 'user-1',
          title: 'Draft title',
          body: 'Draft body',
          kind: ContentKind.ARTICLE,
        },
      ],
    ]);
  });

  it('listPublished returns only published items with total', async () => {
    contentRepository.list.mockResolvedValue({
      items: [publishedItem],
      total: 1,
    });

    await expect(
      contentService.listPublished({ limit: 20, offset: 0 }),
    ).resolves.toEqual({ items: [publishedItem], total: 1 });

    expect(contentRepository.list.mock.calls).toEqual([
      [{ status: ContentStatus.PUBLISHED, limit: 20, offset: 0 }],
    ]);
  });

  it('listMine returns the author items in any status', async () => {
    contentRepository.list.mockResolvedValue({
      items: [draftItem, publishedItem],
      total: 2,
    });

    await expect(
      contentService.listMine('user-1', { limit: 20, offset: 0 }),
    ).resolves.toEqual({ items: [draftItem, publishedItem], total: 2 });

    expect(contentRepository.list.mock.calls).toEqual([
      [{ authorId: 'user-1', limit: 20, offset: 0 }],
    ]);
  });

  it('getById returns a published item to anyone', async () => {
    contentRepository.findById.mockResolvedValue(publishedItem);

    await expect(
      contentService.getById('content-1', strangerViewer),
    ).resolves.toEqual(publishedItem);
  });

  it('getById returns a draft to its author', async () => {
    contentRepository.findById.mockResolvedValue(draftItem);

    await expect(
      contentService.getById('content-1', authorViewer),
    ).resolves.toEqual(draftItem);
  });

  it('getById hides drafts from strangers', async () => {
    contentRepository.findById.mockResolvedValue(draftItem);

    await expect(
      contentService.getById('content-1', strangerViewer),
    ).rejects.toThrow(new ForbiddenException('Access denied'));
  });

  it('getById throws 404 for a missing item', async () => {
    contentRepository.findById.mockResolvedValue(null);

    await expect(
      contentService.getById('missing', strangerViewer),
    ).rejects.toThrow(new NotFoundException('Content not found'));
  });

  it('update lets the author publish a draft', async () => {
    contentRepository.findById.mockResolvedValue(draftItem);
    contentRepository.update.mockResolvedValue({
      ...draftItem,
      status: ContentStatus.PUBLISHED,
    });

    await expect(
      contentService.update('content-1', authorViewer, {
        status: ContentStatus.PUBLISHED,
      }),
    ).resolves.toMatchObject({ status: ContentStatus.PUBLISHED });

    expect(contentRepository.update.mock.calls).toEqual([
      ['content-1', { status: ContentStatus.PUBLISHED }],
    ]);
  });

  it('update rejects an illegal author transition', async () => {
    contentRepository.findById.mockResolvedValue(publishedItem);

    await expect(
      contentService.update('content-1', authorViewer, {
        status: ContentStatus.DRAFT,
      }),
    ).rejects.toThrow(new BadRequestException('Invalid status transition'));

    expect(contentRepository.update.mock.calls).toHaveLength(0);
  });

  it('update lets a moderator change any status', async () => {
    contentRepository.findById.mockResolvedValue(draftItem);
    contentRepository.update.mockResolvedValue({
      ...draftItem,
      status: ContentStatus.PUBLISHED,
    });

    await expect(
      contentService.update('content-1', moderatorViewer, {
        status: ContentStatus.PUBLISHED,
      }),
    ).resolves.toMatchObject({ status: ContentStatus.PUBLISHED });
  });

  it('update forbids strangers', async () => {
    contentRepository.findById.mockResolvedValue(draftItem);

    await expect(
      contentService.update('content-1', strangerViewer, {
        title: 'Hacked',
      }),
    ).rejects.toThrow(new ForbiddenException('Access denied'));

    expect(contentRepository.update.mock.calls).toHaveLength(0);
  });

  it('remove lets the author delete a draft', async () => {
    contentRepository.findById.mockResolvedValue(draftItem);
    contentRepository.remove.mockResolvedValue(draftItem);

    await expect(
      contentService.remove('content-1', authorViewer),
    ).resolves.toBeUndefined();

    expect(contentRepository.remove.mock.calls).toEqual([['content-1']]);
  });

  it('remove forbids the author to delete a published item', async () => {
    contentRepository.findById.mockResolvedValue(publishedItem);

    await expect(
      contentService.remove('content-1', authorViewer),
    ).rejects.toThrow(new ForbiddenException('Access denied'));

    expect(contentRepository.remove.mock.calls).toHaveLength(0);
  });

  it('remove lets an admin delete anything', async () => {
    contentRepository.findById.mockResolvedValue(publishedItem);
    contentRepository.remove.mockResolvedValue(publishedItem);

    await expect(
      contentService.remove('content-1', adminViewer),
    ).resolves.toBeUndefined();

    expect(contentRepository.remove.mock.calls).toEqual([['content-1']]);
  });

  it('remove forbids a moderator to delete', async () => {
    contentRepository.findById.mockResolvedValue(publishedItem);

    await expect(
      contentService.remove('content-1', moderatorViewer),
    ).rejects.toThrow(new ForbiddenException('Access denied'));

    expect(contentRepository.remove.mock.calls).toHaveLength(0);
  });
});
