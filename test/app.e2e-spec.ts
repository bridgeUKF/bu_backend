import cookie from '@fastify/cookie';
import { ValidationPipe, VersioningType } from '@nestjs/common';
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
      create: jest.fn(),
      createWithRole: jest.fn(),
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

  afterEach(async () => {
    await app.close();
  });
});
