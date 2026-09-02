import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ContentKind, ContentStatus, ReactionValue } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import {
  ContentRecord,
  ContentRepository,
  FavoriteRepository,
  ReactionRepository,
} from './content.repository';
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
  likeCount: 0,
  dislikeCount: 0,
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
    search: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let favoriteRepository: {
    findFavorite: jest.Mock;
    createFavorite: jest.Mock;
    removeFavorite: jest.Mock;
    listFavorites: jest.Mock;
  };
  let reactionRepository: {
    upsertReactionAndRecount: jest.Mock;
    removeReactionAndRecount: jest.Mock;
  };

  beforeEach(() => {
    contentRepository = {
      findById: jest.fn(),
      list: jest.fn(),
      search: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    favoriteRepository = {
      findFavorite: jest.fn(),
      createFavorite: jest.fn(),
      removeFavorite: jest.fn(),
      listFavorites: jest.fn(),
    };
    reactionRepository = {
      upsertReactionAndRecount: jest.fn(),
      removeReactionAndRecount: jest.fn(),
    };

    contentService = new ContentService(
      contentRepository as unknown as ContentRepository,
      favoriteRepository as unknown as FavoriteRepository,
      reactionRepository as unknown as ReactionRepository,
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

  describe('searchPublished', () => {
    it('searches published items by query', async () => {
      contentRepository.search.mockResolvedValue({
        items: [publishedItem],
        total: 1,
      });

      await expect(
        contentService.searchPublished({ q: 'guide', limit: 20, offset: 0 }),
      ).resolves.toEqual({ items: [publishedItem], total: 1 });

      expect(contentRepository.search.mock.calls).toEqual([
        [{ q: 'guide', limit: 20, offset: 0 }],
      ]);
    });

    it('passes the kind filter through', async () => {
      contentRepository.search.mockResolvedValue({ items: [], total: 0 });

      await contentService.searchPublished({
        q: 'guide',
        kind: ContentKind.GUIDE,
        limit: 10,
        offset: 5,
      });

      expect(contentRepository.search.mock.calls).toEqual([
        [{ q: 'guide', kind: ContentKind.GUIDE, limit: 10, offset: 5 }],
      ]);
    });
  });

  describe('favorites', () => {
    const favorite = {
      id: 'favorite-1',
      userId: 'stranger-1',
      contentId: 'content-1',
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
    };

    it('addFavorite stores a favorite for a published item', async () => {
      contentRepository.findById.mockResolvedValue(publishedItem);
      favoriteRepository.findFavorite.mockResolvedValue(null);
      favoriteRepository.createFavorite.mockResolvedValue(favorite);

      await expect(
        contentService.addFavorite('stranger-1', 'content-1'),
      ).resolves.toEqual({ favorite, created: true });

      expect(favoriteRepository.createFavorite.mock.calls).toEqual([
        ['stranger-1', 'content-1'],
      ]);
    });

    it('addFavorite is idempotent for an existing favorite', async () => {
      contentRepository.findById.mockResolvedValue(publishedItem);
      favoriteRepository.findFavorite.mockResolvedValue(favorite);

      await expect(
        contentService.addFavorite('stranger-1', 'content-1'),
      ).resolves.toEqual({ favorite, created: false });

      expect(favoriteRepository.createFavorite.mock.calls).toHaveLength(0);
    });

    it('addFavorite rejects drafts', async () => {
      contentRepository.findById.mockResolvedValue(draftItem);

      await expect(
        contentService.addFavorite('stranger-1', 'content-1'),
      ).rejects.toThrow(new ForbiddenException('Access denied'));

      expect(favoriteRepository.createFavorite.mock.calls).toHaveLength(0);
    });

    it('addFavorite throws 404 for a missing item', async () => {
      contentRepository.findById.mockResolvedValue(null);

      await expect(
        contentService.addFavorite('stranger-1', 'missing'),
      ).rejects.toThrow(new NotFoundException('Content not found'));
    });

    it('removeFavorite is idempotent', async () => {
      favoriteRepository.removeFavorite.mockResolvedValue(undefined);

      await expect(
        contentService.removeFavorite('stranger-1', 'content-1'),
      ).resolves.toBeUndefined();

      expect(favoriteRepository.removeFavorite.mock.calls).toEqual([
        ['stranger-1', 'content-1'],
      ]);
    });

    it('listFavorites returns the user bookmarks', async () => {
      favoriteRepository.listFavorites.mockResolvedValue({
        items: [publishedItem],
        total: 1,
      });

      await expect(
        contentService.listFavorites('stranger-1', { limit: 20, offset: 0 }),
      ).resolves.toEqual({ items: [publishedItem], total: 1 });

      expect(favoriteRepository.listFavorites.mock.calls).toEqual([
        ['stranger-1', { limit: 20, offset: 0 }],
      ]);
    });
  });

  describe('reactions', () => {
    const reaction = {
      id: 'reaction-1',
      userId: 'stranger-1',
      contentId: 'content-1',
      value: ReactionValue.LIKE,
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
      updatedAt: new Date('2026-09-03T08:00:00.000Z'),
    };

    it('setReaction stores the vote and returns recounts', async () => {
      contentRepository.findById.mockResolvedValue(publishedItem);
      reactionRepository.upsertReactionAndRecount.mockResolvedValue({
        reaction,
        likeCount: 1,
        dislikeCount: 0,
      });

      await expect(
        contentService.setReaction(
          'stranger-1',
          'content-1',
          ReactionValue.LIKE,
        ),
      ).resolves.toEqual({ reaction, likeCount: 1, dislikeCount: 0 });

      expect(reactionRepository.upsertReactionAndRecount.mock.calls).toEqual([
        ['stranger-1', 'content-1', ReactionValue.LIKE],
      ]);
    });

    it('setReaction rejects drafts', async () => {
      contentRepository.findById.mockResolvedValue(draftItem);

      await expect(
        contentService.setReaction(
          'stranger-1',
          'content-1',
          ReactionValue.LIKE,
        ),
      ).rejects.toThrow(new ForbiddenException('Access denied'));

      expect(
        reactionRepository.upsertReactionAndRecount.mock.calls,
      ).toHaveLength(0);
    });

    it('setReaction throws 404 for a missing item', async () => {
      contentRepository.findById.mockResolvedValue(null);

      await expect(
        contentService.setReaction('stranger-1', 'missing', ReactionValue.LIKE),
      ).rejects.toThrow(new NotFoundException('Content not found'));
    });

    it('removeReaction removes the vote and returns recounts', async () => {
      reactionRepository.removeReactionAndRecount.mockResolvedValue({
        likeCount: 0,
        dislikeCount: 0,
      });

      await expect(
        contentService.removeReaction('stranger-1', 'content-1'),
      ).resolves.toEqual({ likeCount: 0, dislikeCount: 0 });

      expect(reactionRepository.removeReactionAndRecount.mock.calls).toEqual([
        ['stranger-1', 'content-1'],
      ]);
    });
  });
});
