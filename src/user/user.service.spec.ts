import { UserStatus } from '@prisma/client';
import { UserRepository, UserAuthRecord, UserRecord } from './user.repository';
import { UserService } from './user.service';

describe('UserService', () => {
  let userService: UserService;
  let userRepository: jest.Mocked<UserRepository>;

  const userRecord: UserRecord = {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date('2026-08-11T08:00:00.000Z'),
    createdAt: new Date('2026-08-11T08:00:00.000Z'),
    updatedAt: new Date('2026-08-11T08:00:00.000Z'),
  };

  const userAuthRecord: UserAuthRecord = {
    ...userRecord,
    passwordHash: 'hashed-password',
  };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      createWithRole: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    userService = new UserService(userRepository);
  });

  it('findById returns the repository result', async () => {
    userRepository.findById.mockResolvedValue(userRecord);

    await expect(userService.findById('user-1')).resolves.toEqual(userRecord);
  });

  it('findById returns null when repository returns null', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(userService.findById('missing-user')).resolves.toBeNull();
  });

  it('findByEmail returns the repository result', async () => {
    userRepository.findByEmail.mockResolvedValue(userAuthRecord);

    await expect(userService.findByEmail('user@example.com')).resolves.toEqual(
      userAuthRecord,
    );
  });

  it('findByEmail returns null when repository returns null', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await expect(
      userService.findByEmail('missing@example.com'),
    ).resolves.toBeNull();
  });

  it('create delegates creation to the repository', async () => {
    const createData = {
      email: 'new@example.com',
      passwordHash: 'hashed-password',
      firstName: 'Grace',
      lastName: 'Hopper',
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
    };

    userRepository.create.mockResolvedValue(userRecord);

    await expect(userService.create(createData)).resolves.toEqual(userRecord);
    expect(userRepository.create.mock.calls[0]).toEqual([createData]);
  });

  it('createWithRole delegates atomic provisioning to the repository', async () => {
    const createData = {
      email: 'new@example.com',
      passwordHash: 'hashed-password',
      firstName: 'Grace',
      lastName: 'Hopper',
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
    };

    userRepository.createWithRole.mockResolvedValue(userRecord);

    await expect(
      userService.createWithRole(createData, 'USER'),
    ).resolves.toEqual(userRecord);
    expect(userRepository.createWithRole.mock.calls[0]).toEqual([
      createData,
      'USER',
    ]);
  });
});
