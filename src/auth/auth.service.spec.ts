import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserAuthRecord, UserRecord } from '../user/user.repository';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionRepository } from './session.repository';
import { TokenService } from './token.service';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<UserService>;
  let tokenService: { generateAccessToken: jest.Mock };
  let sessionRepository: { create: jest.Mock };
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

  beforeEach(() => {
    userService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      createWithRole: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    tokenService = {
      generateAccessToken: jest.fn().mockReturnValue('signed-access-token'),
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
    hashMock.mockResolvedValue('hashed-refresh-token');

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
    expect(hashMock.mock.calls).toHaveLength(1);
    expect(sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: activeUserAuthRecord.id,
        refreshTokenHash: 'hashed-refresh-token',
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
    hashMock.mockResolvedValue('hashed-refresh-token');

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
    hashMock.mockResolvedValue('hashed-refresh-token');

    const result = await authService.login(loginDto);

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('registers a new user with the default USER role', async () => {
    userService.findByEmail.mockResolvedValue(null);
    hashMock.mockResolvedValue('hashed-password');
    userService.createWithRole.mockResolvedValue(userRecord);

    await expect(authService.register(registerDto)).resolves.toEqual(
      userRecord,
    );

    expect(userService.findByEmail.mock.calls).toEqual([[registerDto.email]]);
    expect(hashMock.mock.calls).toEqual([[registerDto.password]]);
    expect(userService.createWithRole.mock.calls).toEqual([
      [
        {
          email: registerDto.email,
          passwordHash: 'hashed-password',
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          status: UserStatus.PENDING,
          emailVerifiedAt: null,
        },
        'USER',
      ],
    ]);
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
});
