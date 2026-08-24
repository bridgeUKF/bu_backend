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
  roles: {
    select: {
      role: {
        select: {
          name: true,
        },
      },
    },
  },
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

export type RoleName = 'USER' | 'MODERATOR' | 'ADMIN';

export class RoleNotFoundError extends Error {
  constructor(roleName: RoleName) {
    super(`Role "${roleName}" was not found`);
    this.name = 'RoleNotFoundError';
  }
}

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

  createWithRole(
    data: CreateUserRepositoryData,
    roleName: RoleName,
  ): Promise<UserRecord> {
    return this.prismaService.$transaction(async (prisma) => {
      const user = await prisma.user.create({
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

      const role = await prisma.role.findUnique({
        where: { name: roleName },
        select: { id: true },
      });

      if (!role) {
        throw new RoleNotFoundError(roleName);
      }

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      return user;
    });
  }
}
