import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

const sessionSelect = {
  id: true,
  userId: true,
  refreshTokenHash: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
  revokedAt: true,
} satisfies Prisma.SessionSelect;

export type SessionRecord = Prisma.SessionGetPayload<{
  select: typeof sessionSelect;
}>;

export type CreateSessionData = {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  lastUsedAt?: Date | null;
};

@Injectable()
export class SessionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(data: CreateSessionData): Promise<SessionRecord> {
    return this.prismaService.session.create({
      data: {
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        lastUsedAt: data.lastUsedAt,
      },
      select: sessionSelect,
    });
  }

  findByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionRecord | null> {
    return this.prismaService.session.findUnique({
      where: { refreshTokenHash },
      select: sessionSelect,
    });
  }

  findById(id: string): Promise<SessionRecord | null> {
    return this.prismaService.session.findUnique({
      where: { id },
      select: sessionSelect,
    });
  }

  revoke(id: string, revokedAt: Date = new Date()): Promise<SessionRecord> {
    return this.prismaService.session.update({
      where: { id },
      data: { revokedAt },
      select: sessionSelect,
    });
  }

  revokeAllForUser(userId: string): Promise<number> {
    return this.prismaService.session
      .updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .then((result) => result.count);
  }

  updateRefreshToken(
    id: string,
    refreshTokenHash: string,
  ): Promise<SessionRecord> {
    return this.prismaService.session.update({
      where: { id },
      data: { refreshTokenHash, lastUsedAt: new Date() },
      select: sessionSelect,
    });
  }
}
