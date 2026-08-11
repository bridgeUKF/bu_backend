import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

const userPublicSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const userAuthSelect = {
  ...userPublicSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{
  select: typeof userPublicSelect;
}>;

export type UserAuthRecord = Prisma.UserGetPayload<{
  select: typeof userAuthSelect;
}>;

export type CreateUserRepositoryData = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
};

@Injectable()
export class UserRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.prismaService.user.findUnique({
      where: { id },
      select: userPublicSelect,
    });
  }

  findByEmail(email: string): Promise<UserAuthRecord | null> {
    return this.prismaService.user.findUnique({
      where: { email },
      select: userAuthSelect,
    });
  }

  create(data: CreateUserRepositoryData): Promise<UserRecord> {
    return this.prismaService.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        status: data.status,
        emailVerifiedAt: data.emailVerifiedAt,
      },
      select: userPublicSelect,
    });
  }
}
