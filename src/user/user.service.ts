import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import {
  CreateUserRepositoryData,
  RoleName,
  UserAuthRecord,
  UserRecord,
  UserRepository,
} from './user.repository';

export type CreateUserData = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
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

  create(data: CreateUserData): Promise<UserRecord> {
    const createUserData: CreateUserRepositoryData = {
      email: data.email,
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      status: data.status,
      emailVerifiedAt: data.emailVerifiedAt,
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
    };

    return this.userRepository.createWithRole(createUserData, roleName);
  }
}
