import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

const profileSelect = {
  id: true,
  userId: true,
  university: true,
  faculty: true,
  studyYear: true,
  bio: true,
  city: true,
  telegram: true,
  github: true,
  linkedin: true,
  website: true,
  interests: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StudentProfileSelect;

export type ProfileRecord = Prisma.StudentProfileGetPayload<{
  select: typeof profileSelect;
}>;

export type UpsertProfileData = {
  university?: string;
  faculty?: string;
  studyYear?: number;
  bio?: string;
  city?: string;
  telegram?: string;
  github?: string;
  linkedin?: string;
  website?: string;
  interests?: string[];
};

@Injectable()
export class ProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findByUserId(userId: string): Promise<ProfileRecord | null> {
    return this.prismaService.studentProfile.findUnique({
      where: { userId },
      select: profileSelect,
    });
  }

  upsertByUserId(
    userId: string,
    data: UpsertProfileData,
  ): Promise<ProfileRecord> {
    return this.prismaService.studentProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
      select: profileSelect,
    });
  }
}
