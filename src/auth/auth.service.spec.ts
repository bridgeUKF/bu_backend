import { ConflictException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserAuthRecord, UserRecord } from '../user/user.repository';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

jest.mock('argon2', () => ({
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<UserService>;
  let hashMock: jest.MockedFunction<typeof argon2.hash>;

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
  };

  beforeEach(() => {
    userService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      createWithRole: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    authService = new AuthService(userService);
    hashMock = jest.mocked(argon2.hash);
    hashMock.mockReset();
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
