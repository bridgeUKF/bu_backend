import { NotFoundException } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

describe('ProfileController', () => {
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
      updatedAt: new Date('2026-09-03T08:00:00.000Z'),
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
    },
  };

  const profile = {
    id: 'profile-1',
    userId: 'user-1',
    university: 'Bridge University',
    faculty: null,
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

  const setup = () => {
    const profileService = {
      getByUserId: jest.fn(),
      upsertMyProfile: jest.fn(),
    };
    const controller = new ProfileController(
      profileService as unknown as ProfileService,
    );
    return { profileService, controller };
  };

  it('getMe returns the own profile', async () => {
    const { profileService, controller } = setup();
    profileService.getByUserId.mockResolvedValue(profile);

    await expect(controller.getMe(authUser)).resolves.toEqual(profile);
    expect(profileService.getByUserId.mock.calls).toEqual([['user-1']]);
  });

  it('getMe throws 404 when there is no profile', async () => {
    const { profileService, controller } = setup();
    profileService.getByUserId.mockResolvedValue(null);

    await expect(controller.getMe(authUser)).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
  });

  it('upsertMe delegates creation or update', async () => {
    const { profileService, controller } = setup();
    profileService.upsertMyProfile.mockResolvedValue(profile);

    await expect(
      controller.upsertMe(authUser, { university: 'Bridge University' }),
    ).resolves.toEqual(profile);
    expect(profileService.upsertMyProfile.mock.calls).toEqual([
      ['user-1', { university: 'Bridge University' }],
    ]);
  });

  it('getByUserId returns any user profile', async () => {
    const { profileService, controller } = setup();
    profileService.getByUserId.mockResolvedValue(profile);

    await expect(controller.getByUserId('other-user')).resolves.toEqual(
      profile,
    );
    expect(profileService.getByUserId.mock.calls).toEqual([['other-user']]);
  });

  it('getByUserId throws 404 when there is no profile', async () => {
    const { profileService, controller } = setup();
    profileService.getByUserId.mockResolvedValue(null);

    await expect(controller.getByUserId('other-user')).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
  });
});
