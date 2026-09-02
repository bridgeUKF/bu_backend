import { ContentKind, ContentStatus } from '@prisma/client';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

describe('ContentController', () => {
  const authUser = {
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

  const item = {
    id: 'content-1',
    authorId: 'user-1',
    kind: ContentKind.ARTICLE,
    status: ContentStatus.DRAFT,
    title: 'Title',
    body: 'Body',
    createdAt: new Date('2026-09-03T08:00:00.000Z'),
    updatedAt: new Date('2026-09-03T08:00:00.000Z'),
  };

  const setup = () => {
    const contentService = {
      create: jest.fn(),
      listPublished: jest.fn(),
      listMine: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const controller = new ContentController(
      contentService as unknown as ContentService,
    );
    return { contentService, controller };
  };

  it('create delegates to the service with the author id', async () => {
    const { contentService, controller } = setup();
    contentService.create.mockResolvedValue(item);

    await expect(
      controller.create(authUser, {
        title: 'Title',
        body: 'Body',
        kind: ContentKind.ARTICLE,
      }),
    ).resolves.toEqual(item);

    expect(contentService.create.mock.calls).toEqual([
      ['user-1', { title: 'Title', body: 'Body', kind: ContentKind.ARTICLE }],
    ]);
  });

  it('list delegates pagination and kind filter', async () => {
    const { contentService, controller } = setup();
    contentService.listPublished.mockResolvedValue({ items: [item], total: 1 });

    await expect(
      controller.list({ limit: 10, offset: 5, kind: ContentKind.GUIDE }),
    ).resolves.toEqual({ items: [item], total: 1 });

    expect(contentService.listPublished.mock.calls).toEqual([
      [{ limit: 10, offset: 5, kind: ContentKind.GUIDE }],
    ]);
  });

  it('listMine delegates with the author id', async () => {
    const { contentService, controller } = setup();
    contentService.listMine.mockResolvedValue({ items: [item], total: 1 });

    await expect(
      controller.listMine(authUser, { limit: 20, offset: 0 }),
    ).resolves.toEqual({ items: [item], total: 1 });

    expect(contentService.listMine.mock.calls).toEqual([
      ['user-1', { limit: 20, offset: 0 }],
    ]);
  });

  it('getById delegates with the viewer', async () => {
    const { contentService, controller } = setup();
    contentService.getById.mockResolvedValue(item);

    await expect(controller.getById(authUser, 'content-1')).resolves.toEqual(
      item,
    );

    expect(contentService.getById.mock.calls).toEqual([
      ['content-1', authUser],
    ]);
  });

  it('update delegates with the viewer', async () => {
    const { contentService, controller } = setup();
    contentService.update.mockResolvedValue(item);

    await expect(
      controller.update(authUser, 'content-1', { title: 'New title' }),
    ).resolves.toEqual(item);

    expect(contentService.update.mock.calls).toEqual([
      ['content-1', authUser, { title: 'New title' }],
    ]);
  });

  it('remove delegates with the viewer', async () => {
    const { contentService, controller } = setup();
    contentService.remove.mockResolvedValue(undefined);

    await expect(controller.remove(authUser, 'content-1')).resolves.toEqual({});

    expect(contentService.remove.mock.calls).toEqual([['content-1', authUser]]);
  });
});
