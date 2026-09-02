import { BadRequestException } from '@nestjs/common';
import {
  ProfileRecord,
  ProfileRepository,
  UpsertProfileData,
} from './profile.repository';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let profileService: ProfileService;
  let profileRepository: {
    findByUserId: jest.Mock;
    upsertByUserId: jest.Mock;
  };

  const profile: ProfileRecord = {
    id: 'profile-1',
    userId: 'user-1',
    university: 'Bridge University',
    faculty: 'Computer Science',
    studyYear: 2,
    bio: 'Student',
    city: 'Bratislava',
    telegram: '@ada',
    github: 'ada',
    linkedin: 'ada',
    website: 'https://example.com',
    interests: ['math', 'code'],
    createdAt: new Date('2026-09-03T08:00:00.000Z'),
    updatedAt: new Date('2026-09-03T08:00:00.000Z'),
  };

  beforeEach(() => {
    profileRepository = {
      findByUserId: jest.fn(),
      upsertByUserId: jest.fn(),
    };

    profileService = new ProfileService(
      profileRepository as unknown as ProfileRepository,
    );
  });

  it('getByUserId returns the repository result', async () => {
    profileRepository.findByUserId.mockResolvedValue(profile);

    await expect(profileService.getByUserId('user-1')).resolves.toEqual(
      profile,
    );
    expect(profileRepository.findByUserId.mock.calls).toEqual([['user-1']]);
  });

  it('getByUserId returns null when there is no profile', async () => {
    profileRepository.findByUserId.mockResolvedValue(null);

    await expect(profileService.getByUserId('user-1')).resolves.toBeNull();
  });

  it('upsertMyProfile creates or updates the profile', async () => {
    const data: UpsertProfileData = {
      university: 'Bridge University',
      studyYear: 2,
      interests: ['math'],
    };
    profileRepository.upsertByUserId.mockResolvedValue(profile);

    await expect(
      profileService.upsertMyProfile('user-1', data),
    ).resolves.toEqual(profile);
    expect(profileRepository.upsertByUserId.mock.calls).toEqual([
      ['user-1', data],
    ]);
  });

  it('upsertMyProfile rejects an empty update', async () => {
    await expect(profileService.upsertMyProfile('user-1', {})).rejects.toThrow(
      new BadRequestException('Nothing to update'),
    );

    expect(profileRepository.upsertByUserId.mock.calls).toHaveLength(0);
  });
});
