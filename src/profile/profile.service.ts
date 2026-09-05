import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ProfileRecord,
  ProfileRepository,
  UpsertProfileData,
} from './profile.repository';
import { StorageService } from '../storage/storage.service';

export type { ProfileRecord, UpsertProfileData } from './profile.repository';

export type AvatarUpload = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ProfileService {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly storageService: StorageService,
  ) {}

  getByUserId(userId: string): Promise<ProfileRecord | null> {
    return this.profileRepository.findByUserId(userId);
  }

  async upsertMyProfile(
    userId: string,
    data: UpsertProfileData,
  ): Promise<ProfileRecord> {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    return this.profileRepository.upsertByUserId(userId, data);
  }

  async setAvatar(userId: string, file: AvatarUpload): Promise<ProfileRecord> {
    const extension = AVATAR_EXTENSIONS[file.mimetype];

    if (!extension) {
      throw new BadRequestException('Unsupported file type');
    }

    if (file.size > MAX_AVATAR_BYTES) {
      throw new PayloadTooLargeException('File is too large');
    }

    const key = `avatars/${userId}/${randomUUID()}.${extension}`;
    const existing = await this.profileRepository.findByUserId(userId);
    const stored = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );

    if (existing?.avatarKey && existing.avatarKey !== key) {
      await this.storageService.delete(existing.avatarKey);
    }

    return this.profileRepository.setAvatarByUserId(userId, {
      avatarKey: key,
      avatarUrl: stored.url,
    });
  }

  async removeAvatar(userId: string): Promise<ProfileRecord | null> {
    const existing = await this.profileRepository.findByUserId(userId);

    if (!existing) {
      return null;
    }

    if (!existing.avatarKey) {
      return existing;
    }

    await this.storageService.delete(existing.avatarKey);

    return this.profileRepository.clearAvatarByUserId(userId);
  }
}
