import cookie from '@fastify/cookie';
import {
  NotFoundException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './../src/app.module';
import { appConfig } from './../src/config/app.config';
import { validateEnv } from './../src/config/env.validation';
import { PrismaService } from './../src/infrastructure/database/prisma.service';
import { RedisHealthService } from './../src/infrastructure/redis/redis-health.service';
import { SessionRepository } from './../src/auth/session.repository';
import { TokenService } from './../src/auth/token.service';
import { ContentService } from './../src/content/content.service';
import { ProfileService } from './../src/profile/profile.service';
import { type UserAuthRecord, UserService } from './../src/user/user.service';

describe('App (e2e)', () => {
  let app: NestFastifyApplication;
  let userService: jest.Mocked<UserService>;
  let sessionRepository: {
    create: jest.Mock;
    findById: jest.Mock;
    findByRefreshTokenHash: jest.Mock;
    updateRefreshToken: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  let tokenService: {
    generateAccessToken: jest.Mock;
    verifyAccessToken: jest.Mock;
  };
  let profileService: {
    getByUserId: jest.Mock;
    upsertMyProfile: jest.Mock;
  };
  let contentService: {
    create: jest.Mock;
    listPublished: jest.Mock;
    listMine: jest.Mock;
    getById: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let activeUserAuthRecord: UserAuthRecord;
  let pendingUserAuthRecord: UserAuthRecord;

  const userRecord = {
    id: 'user-1',
    email: 'new@example.com',
    firstName: 'Grace',
    lastName: 'Hopper',
    status: UserStatus.PENDING,
    emailVerifiedAt: null,
    createdAt: new Date('2026-08-11T08:00:00.000Z'),
    updatedAt: new Date('2026-08-11T08:00:00.000Z'),
  };

  beforeEach(async () => {
    const passwordHash = await argon2.hash('secret123');

    activeUserAuthRecord = {
      ...userRecord,
      status: UserStatus.ACTIVE,
      passwordHash,
      roles: [{ role: { name: 'USER' } }],
    };

    pendingUserAuthRecord = {
      ...userRecord,
      email: 'pending@example.com',
      passwordHash,
      roles: [{ role: { name: 'USER' } }],
    };

    userService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAuthById: jest.fn(),
      findByVerificationTokenHash: jest.fn(),
      activate: jest.fn(),
      create: jest.fn(),
      createWithRole: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    sessionRepository = {
      create: jest.fn().mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed-refresh-token',
        expiresAt: new Date('2026-09-14T08:00:00.000Z'),
        createdAt: new Date('2026-08-11T08:00:00.000Z'),
        updatedAt: new Date('2026-08-11T08:00:00.000Z'),
        lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
        revokedAt: null,
      }),
      findById: jest.fn(),
      findByRefreshTokenHash: jest.fn(),
      updateRefreshToken: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };

    tokenService = {
      generateAccessToken: jest.fn().mockReturnValue('test-access-token'),
      verifyAccessToken: jest.fn(),
    };

    profileService = {
      getByUserId: jest.fn(),
      upsertMyProfile: jest.fn(),
    };

    contentService = {
      create: jest.fn(),
      listPublished: jest.fn(),
      listMine: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          expandVariables: true,
          load: [appConfig],
          validate: validateEnv,
        }),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ result: 1 }]),
      })
      .overrideProvider(RedisHealthService)
      .useValue({
        ping: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(UserService)
      .useValue(userService)
      .overrideProvider(SessionRepository)
      .useValue(sessionRepository)
      .overrideProvider(TokenService)
      .useValue(tokenService)
      .overrideProvider(ProfileService)
      .useValue(profileService)
      .overrideProvider(ContentService)
      .useValue(contentService)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.register(cookie);

    const configService = app.get(ConfigService);

    app.setGlobalPrefix(configService.get<string>('app.apiPrefix') ?? 'api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: configService.get<string>('app.apiVersion') ?? '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/api/v1/health (GET)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      checks: {
        application: 'up',
        database: 'up',
        redis: 'up',
      },
    });
  });

  it('/api/v1/auth/register (POST) creates a user', async () => {
    userService.findByEmail.mockResolvedValue(null);
    userService.createWithRole.mockResolvedValue(userRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'new@example.com',
        password: 'secret123',
        firstName: 'Grace',
        lastName: 'Hopper',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: userRecord.id,
      email: userRecord.email,
      firstName: userRecord.firstName,
      lastName: userRecord.lastName,
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
    });
    expect(response.json()).not.toHaveProperty('passwordHash');
  });

  it('/api/v1/auth/register (POST) returns a verification token', async () => {
    userService.findByEmail.mockResolvedValue(null);
    userService.createWithRole.mockResolvedValue(userRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'new@example.com',
        password: 'secret123',
        firstName: 'Grace',
        lastName: 'Hopper',
      },
    });

    expect(response.statusCode).toBe(201);
    const registerBody: unknown = response.json();
    expect(registerBody).toMatchObject({
      verificationToken: expect.any(String) as unknown,
    });
    const verificationToken = (registerBody as { verificationToken?: unknown })
      .verificationToken;
    expect(typeof verificationToken).toBe('string');
    expect(verificationToken as string).toHaveLength(64);
  });

  it('/api/v1/auth/verify-email (POST) activates the user', async () => {
    const activatedUser = {
      ...userRecord,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-09-03T08:00:00.000Z').toISOString(),
    };
    userService.findByVerificationTokenHash.mockResolvedValue({
      id: 'user-1',
      email: userRecord.email,
      status: UserStatus.PENDING,
      emailVerificationTokenHash: 'stored-hash',
      emailVerificationExpiresAt: new Date('2026-09-04T08:00:00.000Z'),
    });
    userService.activate.mockResolvedValue({
      ...userRecord,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-09-03T08:00:00.000Z'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: 'valid-verify-token' },
    });

    expect(response.statusCode).toBe(200);
    const verifyBody: unknown = response.json();
    expect(verifyBody).toMatchObject({
      id: userRecord.id,
      email: userRecord.email,
      status: UserStatus.ACTIVE,
    });
    const emailVerifiedAt = (verifyBody as { emailVerifiedAt?: unknown })
      .emailVerifiedAt;
    expect(emailVerifiedAt).toBe(activatedUser.emailVerifiedAt);
    expect(response.json()).not.toHaveProperty('passwordHash');
    expect(userService.activate.mock.calls).toEqual([['user-1']]);
  });

  it('/api/v1/auth/verify-email (POST) rejects an unknown token', async () => {
    userService.findByVerificationTokenHash.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: 'unknown-token' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      message: 'Invalid or expired verification token',
      error: 'Bad Request',
    });
    expect(userService.activate.mock.calls).toHaveLength(0);
  });

  it('/api/v1/auth/verify-email (POST) rejects invalid request bodies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(userService.activate.mock.calls).toHaveLength(0);
  });

  it('/api/v1/auth/register (POST) rejects duplicate email', async () => {
    userService.findByEmail.mockResolvedValue({
      ...userRecord,
      passwordHash: 'hashed-password',
      roles: [{ role: { name: 'USER' } }],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'new@example.com',
        password: 'secret123',
        firstName: 'Grace',
        lastName: 'Hopper',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      statusCode: 409,
      message: 'Email already exists',
      error: 'Conflict',
    });
    expect(userService.createWithRole.mock.calls).toHaveLength(0);
  });

  it('/api/v1/auth/register (POST) rejects invalid request bodies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'not-an-email',
        password: 'short',
        firstName: '',
        lastName: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
    expect(userService.findByEmail.mock.calls).toHaveLength(0);
    expect(userService.createWithRole.mock.calls).toHaveLength(0);
  });

  it('/api/v1/auth/login (POST) logs in an active user and issues tokens', async () => {
    userService.findByEmail.mockResolvedValue(activeUserAuthRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'new@example.com',
        password: 'secret123',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: 'test-access-token',
      user: {
        id: userRecord.id,
        email: userRecord.email,
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
      },
    });
    expect(response.json()).not.toHaveProperty('passwordHash');
    expect(response.headers['set-cookie']).toContain('refresh_token=');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Lax');
    expect(sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: activeUserAuthRecord.id,
      }),
    );
  });

  it('/api/v1/auth/login (POST) rejects a wrong password', async () => {
    userService.findByEmail.mockResolvedValue(activeUserAuthRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'new@example.com',
        password: 'wrong-password',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
      error: 'Unauthorized',
    });
  });

  it('/api/v1/auth/login (POST) rejects an unknown email', async () => {
    userService.findByEmail.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'missing@example.com',
        password: 'secret123',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
      error: 'Unauthorized',
    });
  });

  it('/api/v1/auth/login (POST) rejects a pending user', async () => {
    userService.findByEmail.mockResolvedValue(pendingUserAuthRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'pending@example.com',
        password: 'secret123',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
      error: 'Unauthorized',
    });
  });

  it('/api/v1/auth/login (POST) rejects invalid request bodies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'not-an-email',
        password: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
  });

  it('/api/v1/auth/refresh (POST) rotates tokens for a valid session', async () => {
    sessionRepository.findByRefreshTokenHash.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    sessionRepository.updateRefreshToken.mockImplementation(
      (id: string, refreshTokenHash: string) =>
        Promise.resolve({
          id,
          userId: 'user-1',
          refreshTokenHash,
          expiresAt: new Date('2026-09-14T08:00:00.000Z'),
          createdAt: new Date('2026-08-11T08:00:00.000Z'),
          updatedAt: new Date('2026-08-11T08:00:00.000Z'),
          lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
          revokedAt: null,
        }),
    );
    userService.findAuthById.mockResolvedValue(activeUserAuthRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: 'valid-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: 'test-access-token',
      user: {
        id: userRecord.id,
        email: userRecord.email,
        status: UserStatus.ACTIVE,
      },
    });
    expect(response.json()).not.toHaveProperty('passwordHash');
    expect(response.json()).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie']).toContain('refresh_token=');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(sessionRepository.updateRefreshToken).toHaveBeenCalled();
  });

  it('/api/v1/auth/refresh (POST) rejects a missing cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      message: 'Invalid refresh token',
      error: 'Unauthorized',
    });
    expect(sessionRepository.updateRefreshToken).not.toHaveBeenCalled();
  });

  it('/api/v1/auth/refresh (POST) rejects an unknown token', async () => {
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: 'unknown-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      message: 'Invalid refresh token',
      error: 'Unauthorized',
    });
    expect(sessionRepository.updateRefreshToken).not.toHaveBeenCalled();
  });

  it('/api/v1/auth/me (GET) returns the current user', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      sessionId: 'session-1',
      roles: ['USER'],
    });
    sessionRepository.findById.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    userService.findAuthById.mockResolvedValue(activeUserAuthRecord);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: userRecord.id,
      email: userRecord.email,
      status: UserStatus.ACTIVE,
    });
    expect(response.json()).not.toHaveProperty('passwordHash');
  });

  it('/api/v1/auth/me (GET) rejects a missing token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      message: 'Invalid access token',
      error: 'Unauthorized',
    });
  });

  it('/api/v1/auth/logout (POST) revokes the current session and clears the cookie', async () => {
    sessionRepository.findByRefreshTokenHash.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    sessionRepository.revoke.mockResolvedValue({
      id: 'session-1',
      revokedAt: new Date('2026-08-11T09:00:00.000Z'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refresh_token: 'current-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(sessionRepository.revoke).toHaveBeenCalledWith('session-1');
    expect(response.headers['set-cookie']).toContain('refresh_token=');
  });

  it('/api/v1/auth/logout-all (POST) revokes every session of the user', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      sessionId: 'session-1',
      roles: ['USER'],
    });
    sessionRepository.findById.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    userService.findAuthById.mockResolvedValue(activeUserAuthRecord);
    sessionRepository.revokeAllForUser.mockResolvedValue(2);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revoked: 2 });
    expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(response.headers['set-cookie']).toContain('refresh_token=');
  });

  it('/api/v1/auth/logout-all (POST) rejects a missing token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
    });

    expect(response.statusCode).toBe(401);
    expect(sessionRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('/api/v1/auth/me (PATCH) updates the profile', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      sessionId: 'session-1',
      roles: ['USER'],
    });
    sessionRepository.findById.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    userService.findAuthById.mockResolvedValue(activeUserAuthRecord);
    userService.update.mockResolvedValue({
      ...userRecord,
      status: UserStatus.ACTIVE,
      firstName: 'Grace',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { firstName: 'Grace' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: userRecord.id,
      firstName: 'Grace',
    });
    expect(response.json()).not.toHaveProperty('passwordHash');
    expect(userService.update.mock.calls).toEqual([
      ['user-1', { firstName: 'Grace' }],
    ]);
  });

  it('/api/v1/auth/me (PATCH) rejects an empty body', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      sessionId: 'session-1',
      roles: ['USER'],
    });
    sessionRepository.findById.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    userService.findAuthById.mockResolvedValue(activeUserAuthRecord);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('/api/v1/auth/change-password (POST) changes the password', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      sessionId: 'session-1',
      roles: ['USER'],
    });
    sessionRepository.findById.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    userService.findAuthById.mockResolvedValue(activeUserAuthRecord);
    userService.update.mockResolvedValue({
      ...userRecord,
      status: UserStatus.ACTIVE,
    });
    sessionRepository.revokeAllForUser.mockResolvedValue(1);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: {
        currentPassword: 'secret123',
        newPassword: 'brand-new-secret123',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
    expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('/api/v1/auth/change-password (POST) rejects a weak new password', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      sessionId: 'session-1',
      roles: ['USER'],
    });
    sessionRepository.findById.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date('2026-09-14T08:00:00.000Z'),
      createdAt: new Date('2026-08-11T08:00:00.000Z'),
      updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
      revokedAt: null,
    });
    userService.findAuthById.mockResolvedValue(activeUserAuthRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: {
        currentPassword: 'secret123',
        newPassword: 'short',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(userService.update.mock.calls).toHaveLength(0);
  });

  describe('student profile', () => {
    const profileRecord = {
      id: 'profile-1',
      userId: 'user-1',
      university: 'Bridge University',
      faculty: 'Computer Science',
      studyYear: 2,
      bio: null,
      city: null,
      telegram: null,
      github: null,
      linkedin: null,
      website: null,
      interests: [],
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
      updatedAt: new Date('2026-09-03T08:00:00.000Z'),
    };

    const mockValidAccess = () => {
      tokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        roles: ['USER'],
      });
      sessionRepository.findById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'stored-hash',
        expiresAt: new Date('2026-09-14T08:00:00.000Z'),
        createdAt: new Date('2026-08-11T08:00:00.000Z'),
        updatedAt: new Date('2026-08-11T08:00:00.000Z'),
        lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
        revokedAt: null,
      });
      userService.findAuthById.mockResolvedValue(activeUserAuthRecord);
    };

    it('/api/v1/profile/me (PUT) creates or updates the own profile', async () => {
      mockValidAccess();
      profileService.upsertMyProfile.mockResolvedValue(profileRecord);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profile/me',
        headers: { authorization: 'Bearer valid-access-token' },
        payload: { university: 'Bridge University', studyYear: 2 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: 'profile-1',
        userId: 'user-1',
        university: 'Bridge University',
        studyYear: 2,
      });
      expect(profileService.upsertMyProfile.mock.calls).toEqual([
        ['user-1', { university: 'Bridge University', studyYear: 2 }],
      ]);
    });

    it('/api/v1/profile/me (PUT) rejects an invalid study year', async () => {
      mockValidAccess();

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profile/me',
        headers: { authorization: 'Bearer valid-access-token' },
        payload: { studyYear: 99 },
      });

      expect(response.statusCode).toBe(400);
      expect(profileService.upsertMyProfile.mock.calls).toHaveLength(0);
    });

    it('/api/v1/profile/me (GET) returns the own profile', async () => {
      mockValidAccess();
      profileService.getByUserId.mockResolvedValue(profileRecord);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profile/me',
        headers: { authorization: 'Bearer valid-access-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: 'profile-1',
        userId: 'user-1',
      });
    });

    it('/api/v1/profile/me (GET) returns 404 when there is no profile', async () => {
      mockValidAccess();
      profileService.getByUserId.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profile/me',
        headers: { authorization: 'Bearer valid-access-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('/api/v1/profile/:userId (GET) returns another user profile', async () => {
      mockValidAccess();
      profileService.getByUserId.mockResolvedValue({
        ...profileRecord,
        userId: 'other-user',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profile/other-user',
        headers: { authorization: 'Bearer valid-access-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(profileService.getByUserId.mock.calls).toEqual([['other-user']]);
    });

    it('/api/v1/profile/:userId (GET) rejects unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profile/other-user',
      });

      expect(response.statusCode).toBe(401);
      expect(profileService.getByUserId.mock.calls).toHaveLength(0);
    });
  });

  describe('content', () => {
    const contentItem = {
      id: 'content-1',
      authorId: 'user-1',
      kind: 'ARTICLE',
      status: 'DRAFT',
      title: 'Title',
      body: 'Body',
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
      updatedAt: new Date('2026-09-03T08:00:00.000Z'),
    };

    const mockValidAccess = () => {
      tokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        roles: ['USER'],
      });
      sessionRepository.findById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'stored-hash',
        expiresAt: new Date('2026-09-14T08:00:00.000Z'),
        createdAt: new Date('2026-08-11T08:00:00.000Z'),
        updatedAt: new Date('2026-08-11T08:00:00.000Z'),
        lastUsedAt: new Date('2026-08-11T08:00:00.000Z'),
        revokedAt: null,
      });
      userService.findAuthById.mockResolvedValue(activeUserAuthRecord);
    };

    it('/api/v1/content (POST) creates a draft', async () => {
      mockValidAccess();
      contentService.create.mockResolvedValue(contentItem);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/content',
        headers: { authorization: 'Bearer valid-access-token' },
        payload: { title: 'Title', body: 'Body', kind: 'ARTICLE' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        id: 'content-1',
        status: 'DRAFT',
      });
    });

    it('/api/v1/content (GET) lists published items', async () => {
      mockValidAccess();
      contentService.listPublished.mockResolvedValue({
        items: [{ ...contentItem, status: 'PUBLISHED' }],
        total: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/content?limit=10&offset=0',
        headers: { authorization: 'Bearer valid-access-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ total: 1 });
      expect(contentService.listPublished.mock.calls).toEqual([
        [{ limit: 10, offset: 0 }],
      ]);
    });

    it('/api/v1/content/:id (GET) returns 404 for a missing item', async () => {
      mockValidAccess();
      contentService.getById.mockRejectedValue(
        new NotFoundException('Content not found'),
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/content/missing',
        headers: { authorization: 'Bearer valid-access-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('/api/v1/content/:id (PATCH) updates an item', async () => {
      mockValidAccess();
      contentService.update.mockResolvedValue({
        ...contentItem,
        status: 'PUBLISHED',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/content/content-1',
        headers: { authorization: 'Bearer valid-access-token' },
        payload: { status: 'PUBLISHED' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'PUBLISHED' });
    });

    it('/api/v1/content/:id (DELETE) removes an item', async () => {
      mockValidAccess();
      contentService.remove.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/content/content-1',
        headers: { authorization: 'Bearer valid-access-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});
    });

    it('/api/v1/content (POST) rejects unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/content',
        payload: { title: 'Title', body: 'Body' },
      });

      expect(response.statusCode).toBe(401);
      expect(contentService.create.mock.calls).toHaveLength(0);
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
