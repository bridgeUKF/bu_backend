import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ProfileRecord,
  ProfileRepository,
  UpsertProfileData,
} from './profile.repository';

export type { ProfileRecord, UpsertProfileData } from './profile.repository';

@Injectable()
export class ProfileService {
  constructor(private readonly profileRepository: ProfileRepository) {}

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
}
