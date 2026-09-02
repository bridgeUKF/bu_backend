import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { UserAuthRecord, UserRecord } from '../user/user.repository';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionRecord, SessionRepository } from './session.repository';
import { TokenService } from './token.service';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<UserService>;
  let tokenService: {
    generateAccessToken: jest.Mock;
    verifyAccessToken: jest.Mock;
  };
  let sessionRepository: {
    create: jest.Mock;
    findById: jest.Mock;
    findByRefreshTokenHash: jest.Mock;
    updateRefreshToken: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  let hashMock: jest.MockedFunction<typeof argon2.hash>;
  let verifyMock: jest.MockedFunction<typeof argon2.verify>;

  const registerDto: RegisterDto = {
    email: 'new@example.com',
    password: 'secret123',
    firstName: 'Grace',
    lastName: 'Hopper',
  };

  const userRecord: UserRecord = {
    id: 'user-1',
    email: registerDto.email,
    firstName: registerDto.firstName,
    lastName: registerDto.lastName,
    status: UserStatus.PENDING,
    emailVerifiedAt: null,
    createdAt: new Date('2026-08-11T08:00:00.000Z'),
    updatedAt: new Date('2026-08-11T08:00:00.000Z'),
  };

  const userAuthRecord: UserAuthRecord = {
    ...userRecord,
    passwordHash: 'hashed-password',
    roles: [{ role: { name: 'USER' } }],
  };

  const loginDto: LoginDto = {
    email: 'new@example.com',
    password: 'secret123',
  };

  const sha256hex = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

  const activeSession: SessionRecord = {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'stored-refresh-hash',
    expiresAt: new Date('2026-09-14T08:00:00.000Z'),
    createdAt: new Date('2026-08-15T08:00:00.000Z'),
    updatedAt: new Date('2026-08-15T08:00:00.000Z'),
    lastUsedAt: new Date('2026-08-15T08:00:00.000Z'),
    revokedAt: null,
  };

  beforeEach(() => {
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

    tokenService = {
      generateAccessToken: jest.fn().mockReturnValue('signed-access-token'),
      verifyAccessToken: jest.fn(),
    };

    sessionRepository = {
      create: jest.fn().mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed-refresh-token',
        expiresAt: new Date('2026-09-14T08:00:00.000Z'),
        createdAt: new Date('2026-08-15T08:00:00.000Z'),
        updatedAt: new Date('2026-08-15T08:00:00.000Z'),
        lastUsedAt: new Date('2026-08-15T08:00:00.000Z'),
        revokedAt: null,
      }),
      findById: jest.fn(),
      findByRefreshTokenHash: jest.fn(),
      updateRefreshToken: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };

    authService = new AuthService(
      userService,
      tokenService as unknown as TokenService,
      sessionRepository as unknown as SessionRepository,
    );
    hashMock = jest.mocked(argon2.hash);
    verifyMock = jest.mocked(argon2.verify);
    hashMock.mockReset();
    verifyMock.mockReset();
  });

  it('logs in an active user and returns a safe user payload with an access token', async () => {
    const activeUserAuthRecord: UserAuthRecord = {
      ...userAuthRecord,
      status: UserStatus.ACTIVE,
    };

    userService.findByEmail.mockResolvedValue(activeUserAuthRecord);
    verifyMock.mockResolvedValue(true);

    const loginResult = await authService.login(loginDto);

    expect(loginResult).toMatchObject({
      accessToken: 'signed-access-token',
      user: {
        id: activeUserAuthRecord.id,
        email: activeUserAuthRecord.email,
        firstName: activeUserAuthRecord.firstName,
        lastName: activeUserAuthRecord.lastName,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: activeUserAuthRecord.emailVerifiedAt,
        createdAt: activeUserAuthRecord.createdAt,
        updatedAt: activeUserAuthRecord.updatedAt,
      },
    });
    expect(typeof loginResult.refreshToken).toBe('string');

    expect(userService.findByEmail.mock.calls).toEqual([[loginDto.email]]);
    expect(verifyMock.mock.calls).toEqual([
      [activeUserAuthRecord.passwordHash, loginDto.password],
    ]);
    expect(hashMock.mock.calls).toHaveLength(0);
    expect(sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: activeUserAuthRecord.id,
        refreshTokenHash: sha256hex(loginResult.refreshToken),
      }),
    );
    expect(tokenService.generateAccessToken).toHaveBeenCalledWith({
      sub: activeUserAuthRecord.id,
      sessionId: 'session-1',
      roles: ['USER'],
    });
  });

  it('uses persisted role names in access-token claims', async () => {
    const activeUserAuthRecord: UserAuthRecord = {
      ...userAuthRecord,
      status: UserStatus.ACTIVE,
      roles: [{ role: { name: 'MODERATOR' } }, { role: { name: 'ADMIN' } }],
    };

    userService.findByEmail.mockResolvedValue(activeUserAuthRecord);
    verifyMock.mockResolvedValue(true);

    await authService.login(loginDto);

    expect(tokenService.generateAccessToken).toHaveBeenCalledWith({
      sub: activeUserAuthRecord.id,
      sessionId: 'session-1',
      roles: ['MODERATOR', 'ADMIN'],
    });
  });

  it('returns generic unauthorized behavior when the user does not exist', async () => {
    userService.findByEmail.mockResolvedValue(null);

    await expect(authService.login(loginDto)).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );

    expect(verifyMock.mock.calls).toHaveLength(0);
  });

  it('returns generic unauthorized behavior when the password is wrong', async () => {
    const activeUserAuthRecord: UserAuthRecord = {
      ...userAuthRecord,
      status: UserStatus.ACTIVE,
    };

    userService.findByEmail.mockResolvedValue(activeUserAuthRecord);
    verifyMock.mockResolvedValue(false);

    await expect(authService.login(loginDto)).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
  });

  it('returns generic unauthorized behavior for pending users', async () => {
    userService.findByEmail.mockResolvedValue(userAuthRecord);

    await expect(authService.login(loginDto)).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );

    expect(verifyMock.mock.calls).toHaveLength(0);
  });

  it('returns generic unauthorized behavior for suspended users', async () => {
    userService.findByEmail.mockResolvedValue({
      ...userAuthRecord,
      status: UserStatus.SUSPENDED,
    });

    await expect(authService.login(loginDto)).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );

    expect(verifyMock.mock.calls).toHaveLength(0);
  });

  it('never returns passwordHash from login', async () => {
    const activeUserAuthRecord: UserAuthRecord = {
      ...userAuthRecord,
      status: UserStatus.ACTIVE,
    };

    userService.findByEmail.mockResolvedValue(activeUserAuthRecord);
    verifyMock.mockResolvedValue(true);

    const result = await authService.login(loginDto);

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('registers a new user with the default USER role', async () => {
    userService.findByEmail.mockResolvedValue(null);
    hashMock.mockResolvedValue('hashed-password');
    userService.createWithRole.mockResolvedValue(userRecord);

    const result = await authService.register(registerDto);

    expect(result.user).toEqual(userRecord);
    expect(typeof result.verificationToken).toBe('string');
    expect(result.verificationToken).toHaveLength(64);

    expect(userService.findByEmail.mock.calls).toEqual([[registerDto.email]]);
    expect(hashMock.mock.calls).toEqual([[registerDto.password]]);
    const createCalls = userService.createWithRole.mock.calls;
    expect(createCalls).toHaveLength(1);
    const [createData, roleName] = createCalls[0];
    expect(roleName).toBe('USER');
    expect(createData).toMatchObject({
      email: registerDto.email,
      passwordHash: 'hashed-password',
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
      emailVerificationTokenHash: sha256hex(result.verificationToken),
    });
    expect(
      (
        createData as unknown as {
          emailVerificationExpiresAt?: unknown;
        }
      ).emailVerificationExpiresAt,
    ).toBeInstanceOf(Date);
  });

  it('throws a conflict exception when the email already exists', async () => {
    userService.findByEmail.mockResolvedValue(userAuthRecord);

    await expect(authService.register(registerDto)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(hashMock.mock.calls).toHaveLength(0);
    expect(userService.createWithRole.mock.calls).toHaveLength(0);
  });

  it('does not create a user when password hashing fails', async () => {
    userService.findByEmail.mockResolvedValue(null);
    hashMock.mockRejectedValue(new Error('hashing failed'));

    await expect(authService.register(registerDto)).rejects.toThrow(
      'hashing failed',
    );

    expect(userService.createWithRole.mock.calls).toHaveLength(0);
  });

  it('maps unique constraint errors to the same conflict behavior', async () => {
    userService.findByEmail.mockResolvedValue(null);
    hashMock.mockResolvedValue('hashed-password');
    userService.createWithRole.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.15.0',
      }),
    );

    await expect(authService.register(registerDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('propagates unexpected createWithRole failures', async () => {
    const error = new Error('database unavailable');

    userService.findByEmail.mockResolvedValue(null);
    hashMock.mockResolvedValue('hashed-password');
    userService.createWithRole.mockRejectedValue(error);

    await expect(authService.register(registerDto)).rejects.toThrow(error);
  });

  describe('refresh', () => {
    const activeUserAuthRecord: UserAuthRecord = {
      ...userAuthRecord,
      status: UserStatus.ACTIVE,
    };

    const setupValidRefresh = (refreshToken: string) => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        ...activeSession,
        refreshTokenHash: sha256hex(refreshToken),
      });
      sessionRepository.updateRefreshToken.mockImplementation(
        (id: string, refreshTokenHash: string) =>
          Promise.resolve({
            ...activeSession,
            id,
            refreshTokenHash,
          }),
      );
      userService.findAuthById.mockResolvedValue(activeUserAuthRecord);
    };

    it('rotates the refresh token and returns a new access token', async () => {
      const oldRefreshToken =
        'old-refresh-token-0123456789abcdef-0123456789abcdef';
      setupValidRefresh(oldRefreshToken);

      const result = await authService.refresh(oldRefreshToken);

      expect(result.accessToken).toBe('signed-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe(oldRefreshToken);
      expect(result.user).toEqual({
        id: activeUserAuthRecord.id,
        email: activeUserAuthRecord.email,
        firstName: activeUserAuthRecord.firstName,
        lastName: activeUserAuthRecord.lastName,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: activeUserAuthRecord.emailVerifiedAt,
        createdAt: activeUserAuthRecord.createdAt,
        updatedAt: activeUserAuthRecord.updatedAt,
      });
      expect(sessionRepository.findByRefreshTokenHash).toHaveBeenCalledWith(
        sha256hex(oldRefreshToken),
      );
      expect(sessionRepository.updateRefreshToken).toHaveBeenCalledWith(
        activeSession.id,
        sha256hex(result.refreshToken),
      );
      expect(tokenService.generateAccessToken).toHaveBeenCalledWith({
        sub: activeUserAuthRecord.id,
        sessionId: activeSession.id,
        roles: ['USER'],
      });
    });

    it('rejects an unknown refresh token', async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);

      await expect(authService.refresh('unknown-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(sessionRepository.updateRefreshToken).not.toHaveBeenCalled();
      expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
    });

    it('rejects a missing refresh token', async () => {
      await expect(authService.refresh(undefined)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(sessionRepository.findByRefreshTokenHash).not.toHaveBeenCalled();
    });

    it('rejects an expired session', async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        ...activeSession,
        expiresAt: new Date('2026-08-01T08:00:00.000Z'),
      });

      await expect(authService.refresh('expired-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(sessionRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects a revoked session', async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date('2026-08-15T09:00:00.000Z'),
      });

      await expect(authService.refresh('revoked-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(sessionRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects refresh when the user is no longer active', async () => {
      setupValidRefresh('token-of-suspended-user');
      userService.findAuthById.mockResolvedValue({
        ...activeUserAuthRecord,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        authService.refresh('token-of-suspended-user'),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(sessionRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects refresh when the user no longer exists', async () => {
      setupValidRefresh('token-of-deleted-user');
      userService.findAuthById.mockResolvedValue(null);

      await expect(
        authService.refresh('token-of-deleted-user'),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(sessionRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('never returns passwordHash from refresh', async () => {
      setupValidRefresh('some-valid-token');

      const result = await authService.refresh('some-valid-token');

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('validateAccess', () => {
    const accessPayload = {
      sub: 'user-1',
      sessionId: 'session-1',
      roles: ['USER'],
    };

    const setupValidAccess = () => {
      tokenService.verifyAccessToken.mockReturnValue(accessPayload);
      sessionRepository.findById.mockResolvedValue(activeSession);
      userService.findAuthById.mockResolvedValue({
        ...userAuthRecord,
        status: UserStatus.ACTIVE,
      });
    };

    it('returns the authenticated user for a valid token and session', async () => {
      setupValidAccess();

      const result = await authService.validateAccess('valid-token');

      expect(result).toEqual({
        id: 'user-1',
        sessionId: 'session-1',
        roles: ['USER'],
        user: {
          id: 'user-1',
          email: userAuthRecord.email,
          firstName: userAuthRecord.firstName,
          lastName: userAuthRecord.lastName,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: userAuthRecord.emailVerifiedAt,
          createdAt: userAuthRecord.createdAt,
          updatedAt: userAuthRecord.updatedAt,
        },
      });
      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith(
        'valid-token',
      );
      expect(sessionRepository.findById).toHaveBeenCalledWith('session-1');
    });

    it('rejects when token verification fails', async () => {
      tokenService.verifyAccessToken.mockImplementation(() => {
        throw new UnauthorizedException('Invalid access token');
      });

      await expect(authService.validateAccess('bad-token')).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );

      expect(sessionRepository.findById).not.toHaveBeenCalled();
    });

    it('rejects a token without a session id', async () => {
      tokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-1',
        roles: ['USER'],
      });

      await expect(
        authService.validateAccess('sessionless-token'),
      ).rejects.toThrow(new UnauthorizedException('Invalid access token'));

      expect(sessionRepository.findById).not.toHaveBeenCalled();
    });

    it('rejects when the session does not exist', async () => {
      tokenService.verifyAccessToken.mockReturnValue(accessPayload);
      sessionRepository.findById.mockResolvedValue(null);

      await expect(authService.validateAccess('valid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('rejects a revoked session', async () => {
      tokenService.verifyAccessToken.mockReturnValue(accessPayload);
      sessionRepository.findById.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date('2026-08-15T09:00:00.000Z'),
      });

      await expect(authService.validateAccess('valid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('rejects an expired session', async () => {
      tokenService.verifyAccessToken.mockReturnValue(accessPayload);
      sessionRepository.findById.mockResolvedValue({
        ...activeSession,
        expiresAt: new Date('2026-08-01T08:00:00.000Z'),
      });

      await expect(authService.validateAccess('valid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('rejects when the token subject does not match the session user', async () => {
      tokenService.verifyAccessToken.mockReturnValue(accessPayload);
      sessionRepository.findById.mockResolvedValue({
        ...activeSession,
        userId: 'other-user',
      });
      userService.findAuthById.mockResolvedValue({
        ...userAuthRecord,
        status: UserStatus.ACTIVE,
      });

      await expect(authService.validateAccess('valid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('rejects when the user is no longer active', async () => {
      tokenService.verifyAccessToken.mockReturnValue(accessPayload);
      sessionRepository.findById.mockResolvedValue(activeSession);
      userService.findAuthById.mockResolvedValue({
        ...userAuthRecord,
        status: UserStatus.SUSPENDED,
      });

      await expect(authService.validateAccess('valid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });
  });

  describe('logout', () => {
    it('revokes the session matching the refresh cookie', async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(activeSession);
      sessionRepository.revoke.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date('2026-08-15T10:00:00.000Z'),
      });

      await authService.logout('current-refresh-token');

      expect(sessionRepository.findByRefreshTokenHash).toHaveBeenCalledWith(
        sha256hex('current-refresh-token'),
      );
      expect(sessionRepository.revoke).toHaveBeenCalledWith(activeSession.id);
    });

    it('is idempotent when the cookie is missing or unknown', async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);

      await expect(authService.logout(undefined)).resolves.toBeUndefined();
      await expect(
        authService.logout('unknown-token'),
      ).resolves.toBeUndefined();

      expect(sessionRepository.revoke).not.toHaveBeenCalled();
    });

    it('does not revoke an already revoked session again', async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date('2026-08-15T09:00:00.000Z'),
      });

      await expect(
        authService.logout('already-revoked-token'),
      ).resolves.toBeUndefined();

      expect(sessionRepository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('revokes all active sessions of the user and returns the count', async () => {
      sessionRepository.revokeAllForUser.mockResolvedValue(3);

      await expect(authService.logoutAll('user-1')).resolves.toBe(3);

      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('verifyEmail', () => {
    const verificationRecord = {
      id: 'user-1',
      email: registerDto.email,
      status: UserStatus.PENDING,
      emailVerificationTokenHash: 'stored-token-hash',
      emailVerificationExpiresAt: new Date('2026-09-03T08:00:00.000Z'),
    };

    const setupValidToken = (token: string) => {
      userService.findByVerificationTokenHash.mockResolvedValue({
        ...verificationRecord,
        emailVerificationTokenHash: sha256hex(token),
      });
      userService.activate.mockResolvedValue({
        ...userRecord,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date('2026-09-02T22:00:00.000Z'),
      });
    };

    it('activates a pending user with a valid token', async () => {
      setupValidToken('valid-verify-token');

      const result = await authService.verifyEmail('valid-verify-token');

      expect(result.status).toBe(UserStatus.ACTIVE);
      expect(result.emailVerifiedAt).toBeInstanceOf(Date);
      expect(result).not.toHaveProperty('passwordHash');
      expect(userService.findByVerificationTokenHash.mock.calls).toEqual([
        [sha256hex('valid-verify-token')],
      ]);
      expect(userService.activate.mock.calls).toEqual([['user-1']]);
    });

    it('rejects a missing token', async () => {
      await expect(authService.verifyEmail(undefined)).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );

      expect(userService.findByVerificationTokenHash.mock.calls).toHaveLength(
        0,
      );
    });

    it('rejects an unknown token', async () => {
      userService.findByVerificationTokenHash.mockResolvedValue(null);

      await expect(authService.verifyEmail('unknown-token')).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );

      expect(userService.activate.mock.calls).toHaveLength(0);
    });

    it('rejects an expired token', async () => {
      userService.findByVerificationTokenHash.mockResolvedValue({
        ...verificationRecord,
        emailVerificationExpiresAt: new Date('2026-08-01T08:00:00.000Z'),
      });

      await expect(authService.verifyEmail('expired-token')).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );

      expect(userService.activate.mock.calls).toHaveLength(0);
    });

    it('rejects a token for an already active user', async () => {
      userService.findByVerificationTokenHash.mockResolvedValue({
        ...verificationRecord,
        status: UserStatus.ACTIVE,
      });

      await expect(authService.verifyEmail('used-token')).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );

      expect(userService.activate.mock.calls).toHaveLength(0);
    });
  });

  describe('updateMe', () => {
    it('updates the provided fields and returns the safe payload', async () => {
      const updated: UserRecord = { ...userRecord, firstName: 'Grace' };
      userService.update.mockResolvedValue(updated);

      await expect(
        authService.updateMe('user-1', { firstName: 'Grace' }),
      ).resolves.toEqual(updated);

      expect(userService.update.mock.calls).toEqual([
        ['user-1', { firstName: 'Grace' }],
      ]);
    });

    it('rejects an empty update', async () => {
      await expect(authService.updateMe('user-1', {})).rejects.toThrow(
        new BadRequestException('Nothing to update'),
      );

      expect(userService.update.mock.calls).toHaveLength(0);
    });

    it('never returns passwordHash from updateMe', async () => {
      userService.update.mockResolvedValue(userRecord);

      const result = await authService.updateMe('user-1', {
        lastName: 'Hopper',
      });

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('changePassword', () => {
    const activeRecord: UserAuthRecord = {
      ...userAuthRecord,
      status: UserStatus.ACTIVE,
      passwordHash: 'current-hash',
    };

    beforeEach(() => {
      userService.findAuthById.mockResolvedValue(activeRecord);
    });

    it('changes the password and revokes all sessions', async () => {
      verifyMock.mockResolvedValue(true);
      hashMock.mockResolvedValue('new-hash');
      userService.update.mockResolvedValue(userRecord);
      sessionRepository.revokeAllForUser.mockResolvedValue(2);

      await expect(
        authService.changePassword('user-1', 'old-secret', 'new-secret123'),
      ).resolves.toBeUndefined();

      expect(verifyMock).toHaveBeenCalledWith('current-hash', 'old-secret');
      expect(hashMock).toHaveBeenCalledWith('new-secret123');
      expect(userService.update.mock.calls).toEqual([
        ['user-1', { passwordHash: 'new-hash' }],
      ]);
      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('rejects a wrong current password without touching anything', async () => {
      verifyMock.mockResolvedValue(false);

      await expect(
        authService.changePassword('user-1', 'wrong-secret', 'new-secret123'),
      ).rejects.toThrow(new UnauthorizedException('Invalid current password'));

      expect(hashMock.mock.calls).toHaveLength(0);
      expect(userService.update.mock.calls).toHaveLength(0);
      expect(sessionRepository.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
