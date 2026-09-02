import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import {
  CreateUserRepositoryData,
  RoleName,
  UpdateUserData,
  UserAuthRecord,
  UserRecord,
  UserRepository,
  UserVerificationRecord,
} from './user.repository';

export type {
  UpdateUserData,
  UserAuthRecord,
  UserRecord,
  UserVerificationRecord,
} from './user.repository';

export type CreateUserData = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiresAt?: Date | null;
};

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.userRepository.findById(id);
  }

  findByEmail(email: string): Promise<UserAuthRecord | null> {
    return this.userRepository.findByEmail(email);
  }

  findAuthById(id: string): Promise<UserAuthRecord | null> {
    return this.userRepository.findAuthById(id);
  }

  findByVerificationTokenHash(
    tokenHash: string,
  ): Promise<UserVerificationRecord | null> {
    return this.userRepository.findByVerificationTokenHash(tokenHash);
  }

  activate(id: string): Promise<UserRecord> {
    return this.userRepository.activate(id);
  }

  update(id: string, data: UpdateUserData): Promise<UserRecord> {
    return this.userRepository.update(id, data);
  }

  create(data: CreateUserData): Promise<UserRecord> {
    const createUserData: CreateUserRepositoryData = {
      email: data.email,
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      status: data.status,
      emailVerifiedAt: data.emailVerifiedAt,
      emailVerificationTokenHash: data.emailVerificationTokenHash,
      emailVerificationExpiresAt: data.emailVerificationExpiresAt,
    };

    return this.userRepository.create(createUserData);
  }

  createWithRole(
    data: CreateUserData,
    roleName: RoleName,
  ): Promise<UserRecord> {
    const createUserData: CreateUserRepositoryData = {
      email: data.email,
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      status: data.status,
      emailVerifiedAt: data.emailVerifiedAt,
      emailVerificationTokenHash: data.emailVerificationTokenHash,
      emailVerificationExpiresAt: data.emailVerificationExpiresAt,
    };

    return this.userRepository.createWithRole(createUserData, roleName);
  }
}
