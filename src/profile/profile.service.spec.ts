import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
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
    setAvatarByUserId: jest.Mock;
    clearAvatarByUserId: jest.Mock;
  };
  let storageService: {
    upload: jest.Mock;
    delete: jest.Mock;
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
    avatarKey: null,
    avatarUrl: null,
    createdAt: new Date('2026-09-03T08:00:00.000Z'),
    updatedAt: new Date('2026-09-03T08:00:00.000Z'),
  };

  beforeEach(() => {
    profileRepository = {
      findByUserId: jest.fn(),
      upsertByUserId: jest.fn(),
      setAvatarByUserId: jest.fn(),
      clearAvatarByUserId: jest.fn(),
    };
    storageService = {
      upload: jest.fn(),
      delete: jest.fn(),
    };

    profileService = new ProfileService(
      profileRepository as unknown as ProfileRepository,
      storageService,
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

  describe('setAvatar', () => {
    const file = {
      buffer: Buffer.from('img'),
      mimetype: 'image/png',
      size: 1024,
    };

    it('uploads the file and stores key and url', async () => {
      profileRepository.findByUserId.mockResolvedValue(profile);
      storageService.upload.mockResolvedValue({
        url: 'https://pub-test.r2.dev/avatars/user-1/key.png',
      });
      profileRepository.setAvatarByUserId.mockResolvedValue({
        ...profile,
        avatarKey: 'avatars/user-1/key.png',
        avatarUrl: 'https://pub-test.r2.dev/avatars/user-1/key.png',
      });

      const result = await profileService.setAvatar('user-1', file);

      expect(storageService.upload.mock.calls).toHaveLength(1);
      const [key, buffer, contentType] = storageService.upload.mock
        .calls[0] as [string, Buffer, string];
      expect(key).toMatch(/^avatars\/user-1\/.+\.png$/);
      expect(buffer).toEqual(file.buffer);
      expect(contentType).toBe('image/png');
      expect(profileRepository.setAvatarByUserId.mock.calls).toHaveLength(1);
      expect(result.avatarUrl).toBe(
        'https://pub-test.r2.dev/avatars/user-1/key.png',
      );
    });

    it('rejects an unsupported mime type without uploading', async () => {
      await expect(
        profileService.setAvatar('user-1', {
          ...file,
          mimetype: 'image/gif',
        }),
      ).rejects.toThrow(new BadRequestException('Unsupported file type'));

      expect(storageService.upload.mock.calls).toHaveLength(0);
      expect(profileRepository.setAvatarByUserId.mock.calls).toHaveLength(0);
    });

    it('rejects an oversized file without uploading', async () => {
      await expect(
        profileService.setAvatar('user-1', {
          ...file,
          size: 2 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow(new PayloadTooLargeException('File is too large'));

      expect(storageService.upload.mock.calls).toHaveLength(0);
      expect(profileRepository.setAvatarByUserId.mock.calls).toHaveLength(0);
    });

    it('deletes the previous object when replacing the avatar', async () => {
      profileRepository.findByUserId.mockResolvedValue({
        ...profile,
        avatarKey: 'avatars/user-1/old.png',
        avatarUrl: 'https://pub-test.r2.dev/avatars/user-1/old.png',
      });
      storageService.upload.mockResolvedValue({
        url: 'https://pub-test.r2.dev/avatars/user-1/new.png',
      });
      profileRepository.setAvatarByUserId.mockResolvedValue(profile);

      await profileService.setAvatar('user-1', file);

      expect(storageService.delete.mock.calls).toEqual([
        ['avatars/user-1/old.png'],
      ]);
    });
  });

  describe('removeAvatar', () => {
    it('deletes the object and clears avatar fields', async () => {
      profileRepository.findByUserId.mockResolvedValue({
        ...profile,
        avatarKey: 'avatars/user-1/old.png',
        avatarUrl: 'https://pub-test.r2.dev/avatars/user-1/old.png',
      });
      profileRepository.clearAvatarByUserId.mockResolvedValue(profile);

      const result = await profileService.removeAvatar('user-1');

      expect(storageService.delete.mock.calls).toEqual([
        ['avatars/user-1/old.png'],
      ]);
      expect(profileRepository.clearAvatarByUserId.mock.calls).toEqual([
        ['user-1'],
      ]);
      expect(result).toEqual(profile);
    });

    it('is a no-op when the profile has no avatar', async () => {
      profileRepository.findByUserId.mockResolvedValue(profile);

      const result = await profileService.removeAvatar('user-1');

      expect(storageService.delete.mock.calls).toHaveLength(0);
      expect(profileRepository.clearAvatarByUserId.mock.calls).toHaveLength(0);
      expect(result).toEqual(profile);
    });

    it('returns null when there is no profile', async () => {
      profileRepository.findByUserId.mockResolvedValue(null);

      await expect(profileService.removeAvatar('user-1')).resolves.toBeNull();

      expect(storageService.delete.mock.calls).toHaveLength(0);
    });
  });
});
