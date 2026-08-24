import { PrismaService } from '../infrastructure/database/prisma.service';
import { SessionRepository } from './session.repository';

describe('SessionRepository', () => {
  let sessionRepository: SessionRepository;
  let prismaService: {
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaService = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
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

  it('updates the stored refresh token hash', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'new-hashed-token',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T10:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
    };

    prismaService.session.update.mockResolvedValue(session);

    await expect(
      sessionRepository.updateRefreshToken('session-1', 'new-hashed-token'),
    ).resolves.toEqual(session);
  });
});
