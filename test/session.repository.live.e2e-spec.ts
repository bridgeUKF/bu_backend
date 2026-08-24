import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { UserStatus } from '@prisma/client';
import { SessionRepository } from '../src/auth/session.repository';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

const runLiveSessionTests = process.env.RUN_LIVE_SESSION_TESTS === 'true';
const liveDescribe = runLiveSessionTests ? describe : describe.skip;

function readDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const environment = readFileSync('.env', 'utf8');
  const match = environment.match(/^DATABASE_URL=(.+)$/m);

  if (!match) {
    throw new Error('DATABASE_URL is missing from .env');
  }

  const value = match[1].trim();
  return value.charCodeAt(0) === 34 || value.charCodeAt(0) === 39
    ? value.slice(1, -1)
    : value;
}

liveDescribe('SessionRepository live verification', () => {
  let prisma: PrismaService;
  let sessionRepository: SessionRepository;
  let testUserId: string | null = null;

  const cleanupUser = async () => {
    if (!testUserId) {
      return;
    }

    const userId = testUserId;
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    testUserId = null;
  };

  const createUser = async () => {
    const user = await prisma.user.create({
      data: {
        email: `session-live-${randomUUID()}@example.com`,
        passwordHash: 'temporary-password-hash',
        firstName: 'Session',
        lastName: 'User',
        status: UserStatus.ACTIVE,
        roles: {
          create: {
            role: {
              connect: { name: 'USER' },
            },
          },
        },
      },
      select: { id: true },
    });

    testUserId = user.id;
  };

  beforeAll(async () => {
    const databaseUrl = readDatabaseUrl();
    prisma = new PrismaService({
      get: (key: string) =>
        key === 'app.databaseUrl' ? databaseUrl : undefined,
    } as never);
    sessionRepository = new SessionRepository(prisma);

    const userRole = await prisma.role.findUnique({
      where: { name: 'USER' },
      select: { id: true },
    });

    if (!userRole) {
      throw new Error('The seeded USER role is required for the live test');
    }
  });

  beforeEach(async () => {
    await createUser();
  });

  afterEach(async () => {
    await cleanupUser();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and finds a session by refresh-token hash', async () => {
    const refreshTokenHash = `live-refresh-hash-${randomUUID()}`;
    const created = await sessionRepository.create({
      userId: testUserId!,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastUsedAt: null,
    });

    expect(created.userId).toBe(testUserId);
    expect(created.refreshTokenHash).toBe(refreshTokenHash);
    expect(created.revokedAt).toBeNull();
    await expect(
      sessionRepository.findByRefreshTokenHash(refreshTokenHash),
    ).resolves.toMatchObject({
      id: created.id,
      userId: testUserId,
      refreshTokenHash,
    });
  });

  it('updates the stored refresh-token hash', async () => {
    const originalHash = `original-refresh-hash-${randomUUID()}`;
    const nextHash = `rotated-refresh-hash-${randomUUID()}`;
    const created = await sessionRepository.create({
      userId: testUserId!,
      refreshTokenHash: originalHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastUsedAt: null,
    });

    await expect(
      sessionRepository.updateRefreshToken(created.id, nextHash),
    ).resolves.toMatchObject({
      id: created.id,
      refreshTokenHash: nextHash,
    });
    await expect(
      sessionRepository.findByRefreshTokenHash(originalHash),
    ).resolves.toBeNull();
    await expect(
      sessionRepository.findByRefreshTokenHash(nextHash),
    ).resolves.toMatchObject({ id: created.id, userId: testUserId });
  });

  it('revokes a session and persists revokedAt', async () => {
    const created = await sessionRepository.create({
      userId: testUserId!,
      refreshTokenHash: `revoked-refresh-hash-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastUsedAt: null,
    });
    const revokedAt = new Date();

    await expect(
      sessionRepository.revoke(created.id, revokedAt),
    ).resolves.toMatchObject({ id: created.id, revokedAt });
    await expect(
      prisma.session.findUnique({
        where: { id: created.id },
        select: { revokedAt: true },
      }),
    ).resolves.toEqual({ revokedAt });
  });

  it('cleans up only its temporary session and user data', async () => {
    const created = await sessionRepository.create({
      userId: testUserId!,
      refreshTokenHash: `cleanup-refresh-hash-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastUsedAt: null,
    });
    const userId = testUserId!;

    await cleanupUser();

    await expect(
      prisma.session.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.user.findUnique({ where: { id: userId } }),
    ).resolves.toBeNull();
  });
});
