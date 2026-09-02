import { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { SessionRecord, SessionRepository } from './session.repository';

describe('SessionRepository', () => {
  let sessionRepository: SessionRepository;
  let prismaService: {
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock<Promise<SessionRecord>, [Prisma.SessionUpdateArgs]>;
      updateMany: jest.Mock<
        Promise<Prisma.BatchPayload>,
        [Prisma.SessionUpdateManyArgs]
      >;
    };
  };

  beforeEach(() => {
    prismaService = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn<Promise<SessionRecord>, [Prisma.SessionUpdateArgs]>(),
        updateMany: jest.fn<
          Promise<Prisma.BatchPayload>,
          [Prisma.SessionUpdateManyArgs]
        >(),
      },
    };

    sessionRepository = new SessionRepository(
      prismaService as unknown as PrismaService,
    );
  });

  it('creates a session using a hashed refresh token', async () => {
    const createdSession = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hashed-token',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T08:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
    };

    prismaService.session.create.mockResolvedValue(createdSession);

    await expect(
      sessionRepository.create({
        userId: 'user-1',
        refreshTokenHash: 'hashed-token',
        expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      }),
    ).resolves.toEqual(createdSession);
  });

  it('finds a session by refresh token hash', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hashed-token',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T08:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
    };

    prismaService.session.findUnique.mockResolvedValue(session);

    await expect(
      sessionRepository.findByRefreshTokenHash('hashed-token'),
    ).resolves.toEqual(session);
  });

  it('revokes a session by setting revokedAt', async () => {
    const revokedAt = new Date('2026-08-15T09:00:00.000Z');
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hashed-token',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T09:00:00.000Z'),
      lastUsedAt: null,
      revokedAt,
    };

    prismaService.session.update.mockResolvedValue(session);

    await expect(
      sessionRepository.revoke('session-1', revokedAt),
    ).resolves.toEqual(session);
  });

  it('updates the stored refresh token hash and lastUsedAt', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'new-hashed-token',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T10:00:00.000Z'),
      lastUsedAt: new Date('2026-08-15T10:00:00.000Z'),
      revokedAt: null,
    };

    prismaService.session.update.mockResolvedValue(session);

    await expect(
      sessionRepository.updateRefreshToken('session-1', 'new-hashed-token'),
    ).resolves.toEqual(session);

    const updateCalls = prismaService.session.update.mock.calls;
    expect(updateCalls).toHaveLength(1);
    const updateArgs = updateCalls[0][0];
    expect(updateArgs.where).toEqual({ id: 'session-1' });
    expect(updateArgs.data).toMatchObject({
      refreshTokenHash: 'new-hashed-token',
    });
    expect(
      (updateArgs.data as { lastUsedAt?: unknown }).lastUsedAt,
    ).toBeInstanceOf(Date);
  });

  it('finds a session by id', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hashed-token',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T08:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
    };

    prismaService.session.findUnique.mockResolvedValue(session);

    await expect(sessionRepository.findById('session-1')).resolves.toEqual(
      session,
    );
    expect(prismaService.session.findUnique).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      select: expect.anything() as Record<string, boolean>,
    });
  });

  it('revokes all active sessions of a user and returns the count', async () => {
    prismaService.session.updateMany.mockResolvedValue({ count: 3 });

    await expect(sessionRepository.revokeAllForUser('user-1')).resolves.toBe(3);

    const updateManyCalls = prismaService.session.updateMany.mock.calls;
    expect(updateManyCalls).toHaveLength(1);
    const updateManyArgs = updateManyCalls[0][0];
    expect(updateManyArgs.where).toMatchObject({
      userId: 'user-1',
      revokedAt: null,
    });
    expect(updateManyArgs.data).toMatchObject({});
    expect(
      (updateManyArgs.data as { revokedAt?: unknown }).revokedAt,
    ).toBeInstanceOf(Date);
  });
});
